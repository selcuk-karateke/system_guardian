import type { CoolifyMeta } from "@/lib/checks/coolify-meta";
import type { TrivyFinding, TrivyScanRecord } from "./types";

export type RemediationKind = "app_deps" | "os_packages" | "mixed" | "unknown";

const APP_PKG =
  /^(next|next-auth|@auth\/|zod|react|react-dom|express|fastify|axios|lodash|node-tar|@nestjs\/|brace-expansion|minimatch|semver|cross-spawn|glob|PyJWT|anyio|pip|setuptools|wheel)/i;

const OS_PKG =
  /^(lib|linux-|zlib|openssl|ca-certificates|libc6|perl|libperl|python3|curl|wget|bash|coreutils|ncurses|tesseract|bsdutils|util-linux|login|mount|gpg|gpgv|gnupg|dirmngr|sudo|git|tar$|openssh|docker-cli|docker-ce|mesa|libgbm|libgl|libmbed|glib|mariadb|mysql|sqlite|brotli|pcre)/i;

/**
 * Distro/base or intentional feature deps (OCR, PHP-cURL) that Force-Rebuild
 * without a newer Debian release / removing the feature will not clear.
 */
const RESIDUAL_OS =
  /^(libxml2|libncurses|ncurses-|libtinfo|libcurl|curl$|libsystemd|libudev|libtiff|libacl|libtesseract|tesseract|bsdutils|util-linux|libblkid|libmount|libsmartcols|libuuid|liblastlog|login$|mount$|python3-libxml|sudo$|git$|git-man|gpgv|tar$|openssh|docker-cli|mesa|libgbm|libgl|libmbed|libglib|libperl|perl$)/i;

export type RemediationPlan = {
  kind: RemediationKind;
  appPackages: string[];
  osPackages: string[];
  steps: string[];
  redeployHelpsAlone: boolean;
};

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function classifyPkg(name: string | undefined): "app" | "os" | "unknown" {
  if (!name) return "unknown";
  // Debian/OS first — bare names like tar/openssh-client must not fall through as npm.
  if (
    OS_PKG.test(name) ||
    name.includes("1g") ||
    /-(dev|common|bin|base|utils|libs|dbg)$/i.test(name)
  ) {
    return "os";
  }
  if (APP_PKG.test(name) || name.startsWith("@") || name.includes("/")) {
    return "app";
  }
  // Go stdlib from binary scans — treat as residual image/runtime, not npm lockfile.
  if (/^stdlib$/i.test(name)) return "os";
  // npm-style bare names (no digits) vs debian packages with version digits
  if (/^[a-z][a-z0-9-]*$/.test(name) && !/\d/.test(name)) {
    return "app";
  }
  if (/^[a-z0-9][a-z0-9+.-]+$/.test(name)) {
    return "os";
  }
  return "unknown";
}

export type FindingBucket = "app" | "residual" | "os" | "unknown";

export function isResidualOsPackage(pkg: string): boolean {
  return RESIDUAL_OS.test(pkg) || /linux-libc-dev|-dev$/i.test(pkg);
}

/** App-bucket only — UI should not treat OS/Residual like actionable Crit. */
export function appFindingCounts(findings: TrivyFinding[]): {
  critical: number;
  high: number;
} {
  let critical = 0;
  let high = 0;
  for (const f of findings) {
    if (bucketFinding(f) !== "app") continue;
    if (f.severity === "CRITICAL") critical += 1;
    else if (f.severity === "HIGH") high += 1;
  }
  return { critical, high };
}

export function bucketFinding(finding: TrivyFinding): FindingBucket {
  const pkg = finding.pkgName ?? "";
  const kind = classifyPkg(pkg);
  if (kind === "app") return "app";
  if (isResidualOsPackage(pkg)) return "residual";
  if (kind === "os") return "os";
  return "unknown";
}

export type GroupedFinding = {
  vulnerabilityId: string;
  severity: string;
  title: string;
  packages: string[];
  bucket: FindingBucket;
};

/** One row per CVE — packages collapsed (util-linux × 8 → 1 Zeile). */
export function groupFindingsByCve(findings: TrivyFinding[]): GroupedFinding[] {
  const map = new Map<string, GroupedFinding>();
  for (const f of findings) {
    const key = `${f.severity}|${f.vulnerabilityId}`;
    const bucket = bucketFinding(f);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        vulnerabilityId: f.vulnerabilityId,
        severity: f.severity,
        title: f.title,
        packages: f.pkgName ? [f.pkgName] : [],
        bucket,
      });
      continue;
    }
    if (f.pkgName && !existing.packages.includes(f.pkgName)) {
      existing.packages.push(f.pkgName);
    }
    // app > os > residual for label priority
    const rank = { app: 3, os: 2, unknown: 1, residual: 0 } as const;
    if (rank[bucket] > rank[existing.bucket]) existing.bucket = bucket;
  }
  return [...map.values()].sort((a, b) => {
    if (a.severity === b.severity) {
      return a.vulnerabilityId.localeCompare(b.vulnerabilityId);
    }
    return a.severity === "CRITICAL" ? -1 : 1;
  });
}

export function primaryActionLabel(plan: RemediationPlan): string {
  if (plan.kind === "app_deps" || plan.kind === "mixed") {
    return plan.steps.find((s) => /Deps|next|Lockfile|auth/i.test(s)) ?? plan.steps[0] ?? "App-Deps aktualisieren";
  }
  if (!plan.redeployHelpsAlone && plan.osPackages.some(isResidualOsPackage)) {
    return "Residual — Rebuild ändert nichts (Debian/OCR)";
  }
  return plan.steps[0] ?? "Prüfen";
}

function nextBumpHint(findings: TrivyFinding[]): string | null {
  const hits = findings.filter(
    (f) => (f.pkgName ?? "").toLowerCase() === "next",
  );
  if (hits.length === 0) return null;
  return "next auf ≥16.4.1 (16.x) bzw. ≥15.5.28 (15.x) + Lockfile committen";
}

function authBumpHint(findings: TrivyFinding[]): string | null {
  const hits = findings.some((f) =>
    /^(next-auth|@auth\/core)$/i.test(f.pkgName ?? ""),
  );
  if (!hits) return null;
  return "next-auth / @auth/core auf gepatchte Version + Lockfile";
}

export function buildRemediationPlan(
  findings: TrivyFinding[],
): RemediationPlan {
  const appPackages: string[] = [];
  const osPackages: string[] = [];
  for (const f of findings) {
    const pkg = f.pkgName ?? "";
    const kind = classifyPkg(pkg);
    if (kind === "app") appPackages.push(pkg);
    else if (kind === "os") osPackages.push(pkg);
  }
  const apps = uniq(appPackages);
  const os = uniq(osPackages);
  const kind: RemediationKind =
    apps.length && os.length
      ? "mixed"
      : apps.length
        ? "app_deps"
        : os.length
          ? "os_packages"
          : "unknown";

  const steps: string[] = [];
  const nextHint = nextBumpHint(findings);
  const authHint = authBumpHint(findings);
  if (nextHint) steps.push(nextHint);
  if (authHint) steps.push(authHint);
  if (apps.length && !nextHint && !authHint) {
    steps.push(
      `App-Deps bumpen (${apps.slice(0, 5).join(", ")}) + Lockfile committen`,
    );
  } else if (apps.length && (nextHint || authHint)) {
    const extra = apps.filter(
      (p) => !/^(next|next-auth|@auth\/core)$/i.test(p),
    );
    if (extra.length) {
      steps.push(`Weitere Deps: ${extra.slice(0, 4).join(", ")}`);
    }
  }

  if (os.length) {
    const noise = os.filter((p) => /linux-libc-dev|-dev$/i.test(p));
    const real = os.filter((p) => !/linux-libc-dev|-dev$/i.test(p));
    const residual = real.filter((p) => RESIDUAL_OS.test(p));
    const upgradable = real.filter((p) => !RESIDUAL_OS.test(p));

    if (upgradable.length) {
      steps.push(
        `OS/Base: ${upgradable.slice(0, 4).join(", ")} — neuere Distro-Base im Dockerfile + Force-Rebuild`,
      );
    }
    if (residual.length) {
      steps.push(
        `Residual (${residual.slice(0, 4).join(", ")}) — Debian-Patch abwarten oder Feature (z. B. OCR) entfernen; Rebuild allein ändert nichts`,
      );
    }
    if (noise.length && !real.length) {
      steps.push(
        `meist Header-Noise (${noise.slice(0, 3).join(", ")}) — Force-Rebuild hilft oft wenig`,
      );
    } else if (noise.length) {
      steps.push(`Hinweis: ${noise.slice(0, 2).join(", ")} oft nur Image-Header`);
    }
  }

  if (kind === "app_deps" || kind === "mixed") {
    steps.push(
      "Wichtig: reiner Coolify-Restart/Redeploy ohne neuen Commit ändert npm-CVEs nicht",
    );
  }
  steps.push("Danach Docker → Scan Neu");

  const osActionable = os.some(
    (p) => !/linux-libc-dev|-dev$/i.test(p) && !RESIDUAL_OS.test(p),
  );

  return {
    kind,
    appPackages: apps,
    osPackages: os,
    steps,
    redeployHelpsAlone: kind === "os_packages" && osActionable,
  };
}

export function coolifyUuidFromMeta(meta?: CoolifyMeta): string | null {
  const uuid = (meta?.coolifyName ?? "").trim();
  if (uuid && /^[a-z0-9]{10,40}$/i.test(uuid)) return uuid;
  return null;
}

export function formatCoolifyTarget(meta?: CoolifyMeta): string | null {
  if (!meta) return null;
  const parts = [
    meta.projectName,
    meta.fqdn,
    meta.environmentName ? `(${meta.environmentName})` : null,
    meta.branch ? `branch ${meta.branch}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Human recommendation for alerts + UI. */
export function buildTrivyRecommendation(
  record: TrivyScanRecord,
  meta?: CoolifyMeta,
): string {
  const plan = buildRemediationPlan(record.findings);
  const target = formatCoolifyTarget(meta);
  const uuid = coolifyUuidFromMeta(meta);
  const top = record.findings
    .slice(0, 3)
    .map((f) => f.vulnerabilityId)
    .join(", ");

  const parts: string[] = [];
  if (target) parts.push(`App: ${target}`);
  if (uuid) parts.push(`Coolify-UUID: ${uuid}`);
  parts.push(...plan.steps);
  if (plan.redeployHelpsAlone) {
    parts.push(
      "Guardian: Coolify Force-Rebuild (wenn COOLIFY_API_* gesetzt) — zieht neue Base-Layer",
    );
  } else if (plan.kind === "app_deps" || plan.kind === "mixed") {
    parts.push(
      "Nach Commit: Coolify Force-Rebuild (Settings/Docker-Button) oder Deploy-Webhook",
    );
  }
  if (top) parts.push(`Top-CVEs: ${top}`);
  return parts.join(" — ");
}
