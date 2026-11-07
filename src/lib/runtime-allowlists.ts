import { getSetting, setSetting } from "@/lib/app-settings";

const ALLOWLISTS_KEY = "runtime.allowlists";

function splitCsv(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type AllowlistsConfig = {
  expectedStoppedContainers: string[];
  expectedFailedUnits: string[];
  fimPaths: string[];
  knownPorts: string[];
  knownDockerImagePrefixes: string[];
  blockedRemoteIps: string[];
  incidentIocDomains: string[];
  /** Extra regex sources (merged with code defaults). */
  trustedOutboundProcessesExtra: string[];
  trustedShellProcessPatternsExtra: string[];
  autoBlockEnabled: boolean;
  autoBlockJail: string;
};

export const DEFAULT_ALLOWLISTS: AllowlistsConfig = {
  expectedStoppedContainers: ["nextcloud-aio-mastercontainer"],
  expectedFailedUnits: ["chkrootkit.service"],
  fimPaths: [
    "/etc/passwd",
    "/etc/ssh/sshd_config",
    "/etc/sudoers",
    "/root/.ssh/authorized_keys",
  ],
  knownPorts: ["22", "80", "443", "3000", "5432", "6379", "8000", "8080"],
  knownDockerImagePrefixes: [
    "coolifyio/",
    "ghcr.io/coolify",
    "traefik:",
    "postgres:",
    "redis:",
    "mysql:",
    "mariadb:",
    "nginx:",
    "alpine:",
  ],
  blockedRemoteIps: ["216.218.185.162"],
  incidentIocDomains: ["xlgelllulyrhpbjmn.org", "yxmvknylyxtt.org"],
  trustedOutboundProcessesExtra: [],
  trustedShellProcessPatternsExtra: [],
  autoBlockEnabled: false,
  autoBlockJail: "sshd",
};

function parseStringList(raw: unknown, fallback: string[]): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof raw === "string") return splitCsv(raw);
  return [...fallback];
}

function parseAllowlists(raw: unknown): AllowlistsConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ALLOWLISTS };
  const o = raw as Record<string, unknown>;
  const jailRaw =
    typeof o.autoBlockJail === "string" ? o.autoBlockJail.trim() : "";
  const jail = /^[a-zA-Z0-9_-]+$/.test(jailRaw)
    ? jailRaw
    : DEFAULT_ALLOWLISTS.autoBlockJail;
  return {
    expectedStoppedContainers: parseStringList(
      o.expectedStoppedContainers,
      DEFAULT_ALLOWLISTS.expectedStoppedContainers,
    ),
    expectedFailedUnits: parseStringList(
      o.expectedFailedUnits,
      DEFAULT_ALLOWLISTS.expectedFailedUnits,
    ),
    fimPaths: parseStringList(o.fimPaths, DEFAULT_ALLOWLISTS.fimPaths),
    knownPorts: parseStringList(o.knownPorts, DEFAULT_ALLOWLISTS.knownPorts),
    knownDockerImagePrefixes: parseStringList(
      o.knownDockerImagePrefixes,
      DEFAULT_ALLOWLISTS.knownDockerImagePrefixes,
    ),
    blockedRemoteIps: parseStringList(
      o.blockedRemoteIps,
      DEFAULT_ALLOWLISTS.blockedRemoteIps,
    ),
    incidentIocDomains: parseStringList(
      o.incidentIocDomains,
      DEFAULT_ALLOWLISTS.incidentIocDomains,
    ),
    trustedOutboundProcessesExtra: parseStringList(
      o.trustedOutboundProcessesExtra,
      [],
    ),
    trustedShellProcessPatternsExtra: parseStringList(
      o.trustedShellProcessPatternsExtra,
      [],
    ),
    autoBlockEnabled:
      o.autoBlockEnabled === true ||
      o.autoBlockEnabled === "true" ||
      o.autoBlockEnabled === 1,
    autoBlockJail: jail,
  };
}

function envSeedAllowlists(): AllowlistsConfig {
  const base = { ...DEFAULT_ALLOWLISTS };
  if (process.env.EXPECTED_STOPPED_CONTAINERS != null) {
    base.expectedStoppedContainers = splitCsv(
      process.env.EXPECTED_STOPPED_CONTAINERS,
    );
  }
  if (process.env.EXPECTED_FAILED_UNITS != null) {
    base.expectedFailedUnits = splitCsv(process.env.EXPECTED_FAILED_UNITS);
  }
  if (process.env.FIM_PATHS != null) {
    base.fimPaths = splitCsv(process.env.FIM_PATHS);
  }
  if (process.env.KNOWN_PORTS != null) {
    base.knownPorts = splitCsv(process.env.KNOWN_PORTS);
  }
  if (process.env.KNOWN_DOCKER_IMAGE_PREFIXES != null) {
    base.knownDockerImagePrefixes = splitCsv(
      process.env.KNOWN_DOCKER_IMAGE_PREFIXES,
    );
  }
  if (process.env.BLOCKED_REMOTE_IPS != null) {
    base.blockedRemoteIps = splitCsv(process.env.BLOCKED_REMOTE_IPS);
  }
  if (process.env.INCIDENT_IOC_DOMAINS != null) {
    base.incidentIocDomains = splitCsv(process.env.INCIDENT_IOC_DOMAINS);
  }
  if (process.env.TRUSTED_OUTBOUND_PROCESSES != null) {
    base.trustedOutboundProcessesExtra = splitCsv(
      process.env.TRUSTED_OUTBOUND_PROCESSES,
    );
  }
  if (process.env.TRUSTED_SHELL_PROCESS_PATTERNS != null) {
    base.trustedShellProcessPatternsExtra = splitCsv(
      process.env.TRUSTED_SHELL_PROCESS_PATTERNS,
    );
  }
  if (process.env.AUTO_BLOCK_ENABLED != null) {
    base.autoBlockEnabled = process.env.AUTO_BLOCK_ENABLED === "true";
  }
  if (process.env.AUTO_BLOCK_JAIL?.trim()) {
    const j = process.env.AUTO_BLOCK_JAIL.trim();
    if (/^[a-zA-Z0-9_-]+$/.test(j)) base.autoBlockJail = j;
  }
  return base;
}

let cache: AllowlistsConfig = { ...DEFAULT_ALLOWLISTS };
let ready = false;
let loading: Promise<void> | null = null;

export function getCachedAllowlists(): AllowlistsConfig {
  return {
    ...cache,
    expectedStoppedContainers: [...cache.expectedStoppedContainers],
    expectedFailedUnits: [...cache.expectedFailedUnits],
    fimPaths: [...cache.fimPaths],
    knownPorts: [...cache.knownPorts],
    knownDockerImagePrefixes: [...cache.knownDockerImagePrefixes],
    blockedRemoteIps: [...cache.blockedRemoteIps],
    incidentIocDomains: [...cache.incidentIocDomains],
    trustedOutboundProcessesExtra: [...cache.trustedOutboundProcessesExtra],
    trustedShellProcessPatternsExtra: [
      ...cache.trustedShellProcessPatternsExtra,
    ],
  };
}

export async function ensureAllowlistsConfig(): Promise<void> {
  if (ready) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      let stored = await getSetting<unknown>(ALLOWLISTS_KEY);
      if (stored == null) {
        const seeded = envSeedAllowlists();
        await setSetting(ALLOWLISTS_KEY, seeded);
        stored = seeded;
      }
      cache = parseAllowlists(stored);
      ready = true;
    } catch {
      cache = { ...DEFAULT_ALLOWLISTS };
      ready = false;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export type AllowlistsUpdateInput = {
  expectedStoppedContainersRaw?: string;
  expectedFailedUnitsRaw?: string;
  fimPathsRaw?: string;
  knownPortsRaw?: string;
  knownDockerImagePrefixesRaw?: string;
  blockedRemoteIpsRaw?: string;
  incidentIocDomainsRaw?: string;
  trustedOutboundProcessesExtraRaw?: string;
  trustedShellProcessPatternsExtraRaw?: string;
  autoBlockEnabled?: boolean;
  autoBlockJail?: string;
};

export async function updateAllowlistsConfig(
  input: AllowlistsUpdateInput,
): Promise<AllowlistsConfig> {
  await ensureAllowlistsConfig();
  const next: AllowlistsConfig = {
    expectedStoppedContainers:
      input.expectedStoppedContainersRaw != null
        ? splitCsv(input.expectedStoppedContainersRaw)
        : [...cache.expectedStoppedContainers],
    expectedFailedUnits:
      input.expectedFailedUnitsRaw != null
        ? splitCsv(input.expectedFailedUnitsRaw)
        : [...cache.expectedFailedUnits],
    fimPaths:
      input.fimPathsRaw != null
        ? splitCsv(input.fimPathsRaw)
        : [...cache.fimPaths],
    knownPorts:
      input.knownPortsRaw != null
        ? splitCsv(input.knownPortsRaw)
        : [...cache.knownPorts],
    knownDockerImagePrefixes:
      input.knownDockerImagePrefixesRaw != null
        ? splitCsv(input.knownDockerImagePrefixesRaw)
        : [...cache.knownDockerImagePrefixes],
    blockedRemoteIps:
      input.blockedRemoteIpsRaw != null
        ? splitCsv(input.blockedRemoteIpsRaw)
        : [...cache.blockedRemoteIps],
    incidentIocDomains:
      input.incidentIocDomainsRaw != null
        ? splitCsv(input.incidentIocDomainsRaw)
        : [...cache.incidentIocDomains],
    trustedOutboundProcessesExtra:
      input.trustedOutboundProcessesExtraRaw != null
        ? splitCsv(input.trustedOutboundProcessesExtraRaw)
        : [...cache.trustedOutboundProcessesExtra],
    trustedShellProcessPatternsExtra:
      input.trustedShellProcessPatternsExtraRaw != null
        ? splitCsv(input.trustedShellProcessPatternsExtraRaw)
        : [...cache.trustedShellProcessPatternsExtra],
    autoBlockEnabled:
      input.autoBlockEnabled != null
        ? Boolean(input.autoBlockEnabled)
        : cache.autoBlockEnabled,
    autoBlockJail: (() => {
      const j = (input.autoBlockJail ?? cache.autoBlockJail).trim();
      return /^[a-zA-Z0-9_-]+$/.test(j) ? j : DEFAULT_ALLOWLISTS.autoBlockJail;
    })(),
  };
  await setSetting(ALLOWLISTS_KEY, next);
  cache = next;
  ready = true;
  return getCachedAllowlists();
}

/** Test helper */
export function resetAllowlistsConfigForTests(): void {
  cache = { ...DEFAULT_ALLOWLISTS };
  ready = false;
  loading = null;
}
