export interface CoolifyMeta {
  projectName?: string;
  environmentName?: string;
  coolifyName?: string;
  fqdn?: string;
  type?: string;
  applicationId?: string;
  resourceName?: string;
  serviceName?: string;
  branch?: string;
  managed?: boolean;
  databaseSubType?: string;
  databaseId?: string;
}

export function isCoolifyManagedMeta(meta?: CoolifyMeta): boolean {
  if (!meta) return false;
  if (meta.managed) return true;
  if (meta.type === "database" || meta.type === "application") return true;
  if (meta.projectName && (meta.resourceName || meta.serviceName)) return true;
  return false;
}

/** Container-Name aus docker ps / inspect (.Name kann mit / beginnen) */
export function normalizeContainerName(name: string): string {
  const first = name.split(",")[0]?.trim() ?? name;
  return first.replace(/^\//, "");
}

export function getCoolifyMeta(
  map: Map<string, CoolifyMeta>,
  containerName: string,
): CoolifyMeta | undefined {
  const key = normalizeContainerName(containerName);
  return map.get(key) ?? map.get(`/${key}`);
}

export function parseCoolifyLabels(
  labelsJson: string,
  envJoined?: string,
): CoolifyMeta {
  const meta: CoolifyMeta = {};
  if (labelsJson.trim()) {
    try {
      const labels = JSON.parse(labelsJson) as Record<string, string>;
      meta.projectName = labels["coolify.projectName"];
      meta.environmentName = labels["coolify.environmentName"];
      meta.coolifyName = labels["coolify.name"];
      meta.type = labels["coolify.type"];
      meta.applicationId = labels["coolify.applicationId"];
      meta.resourceName = labels["coolify.resourceName"];
      meta.serviceName = labels["coolify.serviceName"];
      meta.managed = labels["coolify.managed"] === "true";
      meta.databaseSubType = labels["coolify.database.subType"];
      meta.databaseId = labels["coolify.databaseId"];
      const composeDir =
        labels["com.docker.compose.project.working_dir"] ?? "";
      if (composeDir.includes("/data/coolify/")) {
        meta.managed = true;
        if (!meta.type) {
          meta.type = composeDir.includes("/databases/")
            ? "database"
            : "application";
        }
      }
      if (
        labels["coolify.resourceName"]?.startsWith("postgresql-database-") ||
        labels["coolify.database.subType"]
      ) {
        meta.type = "database";
        meta.managed = true;
      }
      const caddy = labels["caddy_0"] ?? labels["caddy_1"];
      if (caddy && !meta.fqdn) {
        meta.fqdn = caddy.replace(/^https?:\/\//, "").split(",")[0]?.trim();
      }
    } catch {
      /* ignore */
    }
  }
  if (envJoined) {
    for (const part of envJoined.split("|")) {
      if (part.startsWith("COOLIFY_FQDN=")) {
        meta.fqdn = part.slice("COOLIFY_FQDN=".length).split(",")[0]?.trim();
      }
      if (part.startsWith("COOLIFY_BRANCH=")) {
        meta.branch = part.slice("COOLIFY_BRANCH=".length);
      }
    }
  }
  return meta;
}

/** Menschenlesbarer Name für UI und Alerts */
export function formatContainerDisplay(
  containerName: string,
  meta?: CoolifyMeta,
): string {
  if (!meta || (!meta.projectName && !meta.fqdn && !meta.coolifyName && !meta.resourceName)) {
    return containerName;
  }

  if (meta.type === "database") {
    const dbKind = meta.databaseSubType?.includes("postgres")
      ? "PostgreSQL"
      : meta.databaseSubType?.includes("mysql")
        ? "MySQL"
        : meta.databaseSubType?.includes("redis")
          ? "Redis"
          : "DB";
    const parts = [meta.projectName ?? "Coolify", dbKind];
    if (meta.environmentName) parts.push(`(${meta.environmentName})`);
    return parts.join(" · ");
  }

  const parts: string[] = [];
  if (meta.projectName) parts.push(meta.projectName);
  if (meta.fqdn) parts.push(meta.fqdn);
  else if (meta.coolifyName && meta.coolifyName !== containerName) {
    parts.push(meta.coolifyName);
  } else if (meta.resourceName) {
    parts.push(meta.resourceName.replace(/^postgresql-database-/, "pg "));
  }

  let label = parts.join(" · ");
  if (meta.environmentName && meta.type !== "database") {
    label += ` (${meta.environmentName})`;
  }
  if (meta.branch && meta.branch !== "main" && meta.branch !== "master") {
    label += ` [${meta.branch}]`;
  }
  return label || containerName;
}

/** Alert/Log-Zeile: lesbar + technischer Name in Klammern */
export function formatContainerAlert(
  containerName: string,
  meta?: CoolifyMeta,
): string {
  const display = formatContainerDisplay(containerName, meta);
  if (display === containerName) return containerName;
  return `${display} — ${containerName}`;
}

const INSPECT_FIELD_SEP = "\x1e";

function parseInspectLine(line: string): { name: string; labelsJson: string; envJoined: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.includes(INSPECT_FIELD_SEP)) {
    const parts = trimmed.split(INSPECT_FIELD_SEP);
    if (parts.length < 2) return null;
    return {
      name: normalizeContainerName(parts[0]),
      labelsJson: parts[1] ?? "{}",
      envJoined: parts[2] ?? "",
    };
  }

  const tab = trimmed.indexOf("\t");
  if (tab < 0) return null;
  const name = normalizeContainerName(trimmed.slice(0, tab));
  const rest = trimmed.slice(tab + 1);
  const tab2 = rest.indexOf("\t");
  return {
    name,
    labelsJson: tab2 >= 0 ? rest.slice(0, tab2) : rest,
    envJoined: tab2 >= 0 ? rest.slice(tab2 + 1) : "",
  };
}

export function parseDockerInspectBatch(stdout: string): Map<string, CoolifyMeta> {
  const map = new Map<string, CoolifyMeta>();
  for (const line of stdout.split("\n")) {
    const parsed = parseInspectLine(line);
    if (!parsed) continue;
    map.set(parsed.name, parseCoolifyLabels(parsed.labelsJson, parsed.envJoined));
  }
  return map;
}

/** {{.Name}} statt trimPrefix — ältere Docker-CLI auf dem Host unterstützen kein trimPrefix */
export async function fetchCoolifyMetadata(
  exec: (cmd: string, timeoutMs?: number) => Promise<{ stdout: string }>,
): Promise<Map<string, CoolifyMeta>> {
  const sep = INSPECT_FIELD_SEP;
  const { stdout } = await exec(
    `docker ps -aq 2>/dev/null | xargs -r docker inspect --format '{{.Name}}${sep}{{json .Config.Labels}}${sep}{{join .Config.Env "|"}}' 2>/dev/null || true`,
    120_000,
  );
  return parseDockerInspectBatch(stdout);
}
