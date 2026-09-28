/**
 * docs:check — erkennt Drift zwischen Checks, Labels, Katalog und OpenAPI.
 *
 * Läuft lokal / in CI. Kein Auto-Schreiben: schlägt fehl mit klarer Diff-Liste,
 * damit PRs die Doku mitziehen müssen.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative } from "path";
import { MODULE_CATALOG } from "../src/lib/docs/module-catalog";
import { MODULE_LABELS } from "../src/lib/module-labels";

const ROOT = process.cwd();
const errors: string[] = [];
const warnings: string[] = [];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function fail(msg: string) {
  errors.push(msg);
}

function warn(msg: string) {
  warnings.push(msg);
}

/** Map runXxxCheck → "./file" from checks/index.ts */
function parseCheckIndex(): {
  serverFns: string[];
  securityFns: string[];
  importToFile: Map<string, string>;
} {
  const src = read("src/lib/checks/index.ts");
  const importToFile = new Map<string, string>();
  for (const m of src.matchAll(
    /import\s+\{\s*(\w+)\s*\}\s+from\s+"\.\/([^"]+)"/g,
  )) {
    importToFile.set(m[1], m[2]);
  }

  const serverBlock = src.match(
    /export const SERVER_CHECKS\s*=\s*\[([\s\S]*?)\]\s*as const/,
  );
  const securityBlock = src.match(
    /export const SECURITY_CHECKS\s*=\s*\[([\s\S]*?)\]\s*as const/,
  );
  if (!serverBlock || !securityBlock) {
    fail("SERVER_CHECKS / SECURITY_CHECKS in index.ts nicht gefunden");
    return { serverFns: [], securityFns: [], importToFile };
  }

  const pickFns = (block: string) =>
    [...block.matchAll(/\b(run\w+Check)\b/g)].map((x) => x[1]);

  return {
    serverFns: pickFns(serverBlock[1]),
    securityFns: pickFns(securityBlock[1]),
    importToFile,
  };
}

/** Unique module: "…" strings in a check source file */
function modulesInFile(fileStem: string): string[] {
  const pathTs = join(ROOT, "src/lib/checks", `${fileStem}.ts`);
  if (!existsSync(pathTs)) {
    fail(`Check-Datei fehlt: src/lib/checks/${fileStem}.ts`);
    return [];
  }
  const src = readFileSync(pathTs, "utf8");
  const ids = new Set<string>();
  for (const m of src.matchAll(/module:\s*"([a-z0-9_]+)"/g)) {
    ids.add(m[1]);
  }
  if (ids.size === 0) {
    fail(`Kein module: "…" in src/lib/checks/${fileStem}.ts`);
  }
  return [...ids];
}

function checkModules() {
  const { serverFns, securityFns, importToFile } = parseCheckIndex();
  const discovered = new Map<string, "server" | "security">();

  const walk = (fns: string[], batch: "server" | "security") => {
    for (const fn of fns) {
      const file = importToFile.get(fn);
      if (!file) {
        fail(`${fn} in ${batch}-Batch, aber kein Import in index.ts`);
        continue;
      }
      for (const id of modulesInFile(file)) {
        const prev = discovered.get(id);
        if (prev && prev !== batch) {
          fail(`Modul "${id}" in server und security registriert`);
        }
        discovered.set(id, batch);
      }
    }
  };

  walk(serverFns, "server");
  walk(securityFns, "security");

  const catalogIds = new Set(MODULE_CATALOG.map((m) => m.id));

  for (const [id, batch] of discovered) {
    const entry = MODULE_CATALOG.find((m) => m.id === id);
    if (!entry) {
      fail(
        `Check-Modul "${id}" (${batch}) fehlt in module-catalog.ts — Doku/UI ergänzen`,
      );
      continue;
    }
    if (entry.batch !== batch) {
      fail(
        `Modul "${id}": Katalog-Batch=${entry.batch}, Registrierung=${batch}`,
      );
    }
    if (!MODULE_LABELS[id]) {
      fail(`Modul "${id}" fehlt in MODULE_LABELS (module-labels.ts)`);
    }
  }

  for (const entry of MODULE_CATALOG) {
    if (!discovered.has(entry.id)) {
      fail(
        `Katalog-Eintrag "${entry.id}" ist in keinem Check-Batch registriert (oder module:-String fehlt)`,
      );
    }
  }

  // orphan labels that look like check modules but aren't in catalog
  for (const id of Object.keys(MODULE_LABELS)) {
    if (id === "reserved") continue;
    if (!catalogIds.has(id) && !discovered.has(id)) {
      warn(
        `MODULE_LABELS["${id}"] ohne Katalog/Check — absichtlich (Monitor-only)?`,
      );
    }
  }

  console.log(
    `Checks: ${discovered.size} Module erkannt (${serverFns.length} server runners, ${securityFns.length} security runners)`,
  );
}

/** Collect App Router API paths from route.ts files */
function discoverApiPaths(): string[] {
  const apiRoot = join(ROOT, "src/app/api");
  const paths: string[] = [];

  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) walk(full);
      else if (name.name === "route.ts") {
        const rel = relative(apiRoot, dir).replace(/\\/g, "/");
        paths.push(rel === "" ? "/api" : `/api/${rel}`);
      }
    }
  };
  walk(apiRoot);
  return paths.sort();
}

function checkOpenApi() {
  const specPath = "public/openapi.yaml";
  if (!existsSync(join(ROOT, specPath))) {
    fail(`${specPath} fehlt`);
    return;
  }
  const yaml = read(specPath);
  const specPaths = new Set<string>();
  for (const m of yaml.matchAll(/^\s+(\/api\/[a-z0-9\-_/]+):/gm)) {
    specPaths.add(m[1]);
  }

  const routes = discoverApiPaths();
  for (const p of routes) {
    if (!specPaths.has(p)) {
      fail(`API-Route ${p} fehlt in ${specPath} (Redoc veraltet)`);
    }
  }
  for (const p of specPaths) {
    if (!routes.includes(p)) {
      fail(`OpenAPI-Pfad ${p} ohne Route unter src/app/api/`);
    }
  }
  console.log(
    `OpenAPI: ${specPaths.size} Pfade, ${routes.length} Route-Handler`,
  );
}

function main() {
  console.log("docs:check — Drift zwischen Code und Doku\n");
  checkModules();
  checkOpenApi();

  for (const w of warnings) console.warn(`WARN  ${w}`);
  if (errors.length) {
    console.error("\nFEHLER:");
    for (const e of errors) console.error(`  • ${e}`);
    console.error(
      `\n${errors.length} Problem(e). Katalog: src/lib/docs/module-catalog.ts · Spec: public/openapi.yaml`,
    );
    process.exit(1);
  }
  console.log("\nOK — Katalog, Labels und OpenAPI passen zu den Checks.");
}

main();
