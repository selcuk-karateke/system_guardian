import { getSetting, setSetting } from "@/lib/app-settings";
import { ensureAllowlistsConfig } from "@/lib/runtime-allowlists";
import { ensureOpsConfig } from "@/lib/runtime-ops";

const THRESHOLDS_KEY = "runtime.thresholds";
const TRUSTED_KEY = "runtime.trusted";

/** Hardcoded defaults — ENV is no longer the source of truth. */
export const DEFAULT_THRESHOLDS = {
  CPU_WARNING: 80,
  CPU_CRITICAL: 95,
  RAM_WARNING: 85,
  RAM_CRITICAL: 95,
  DISK_WARNING: 85,
  DISK_CRITICAL: 95,
  PROCESS_CPU_WARNING: 90,
  DOCKER_CPU_WARNING: 85,
  DOCKER_MEM_WARNING: 90,
  EGRESS_MBPS_WARNING: 40,
  EGRESS_MBPS_CRITICAL: 150,
  EGRESS_MB_WARNING: 400,
  EGRESS_MB_CRITICAL: 2048,
  BACKUP_MAX_AGE_DAYS: 7,
  BACKUP_RUN_MAX_AGE_HOURS: 36,
  BACKUP_MIN_SIZE_WARNING_BYTES: 10 * 1024 * 1024,
} as const;

export type ThresholdKey = keyof typeof DEFAULT_THRESHOLDS;
export type ThresholdsMap = Record<ThresholdKey, number>;

export type TrustedConfig = {
  loginIps: string[];
  outboundIps: string[];
};

type Cache = {
  thresholds: ThresholdsMap;
  trusted: TrustedConfig;
};

function splitIps(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

function defaultsCache(): Cache {
  return {
    thresholds: { ...DEFAULT_THRESHOLDS },
    trusted: { loginIps: [], outboundIps: [] },
  };
}

function parseThresholds(raw: unknown): Partial<ThresholdsMap> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<ThresholdsMap> = {};
  for (const key of Object.keys(DEFAULT_THRESHOLDS) as ThresholdKey[]) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out[key] = v;
    } else if (typeof v === "string" && v.trim()) {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0) out[key] = n;
    }
  }
  return out;
}

function parseTrusted(raw: unknown): TrustedConfig {
  if (!raw || typeof raw !== "object") {
    return { loginIps: [], outboundIps: [] };
  }
  const o = raw as Record<string, unknown>;
  const loginIps = Array.isArray(o.loginIps)
    ? o.loginIps.map(String).map((s) => s.trim()).filter(Boolean)
    : splitIps(typeof o.loginIps === "string" ? o.loginIps : "");
  const outboundIps = Array.isArray(o.outboundIps)
    ? o.outboundIps.map(String).map((s) => s.trim()).filter(Boolean)
    : splitIps(typeof o.outboundIps === "string" ? o.outboundIps : "");
  return { loginIps, outboundIps };
}

/** One-time: copy THRESHOLD_* / TRUSTED_* ENV into settings if empty. */
function envSeedThresholds(): Partial<ThresholdsMap> {
  const out: Partial<ThresholdsMap> = {};
  for (const key of Object.keys(DEFAULT_THRESHOLDS) as ThresholdKey[]) {
    const env = process.env[`THRESHOLD_${key}`]?.trim();
    if (!env) continue;
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  // Legacy backup age knobs (same settings blob)
  const backupDays = process.env.BACKUP_MAX_AGE_DAYS?.trim();
  if (backupDays) {
    const n = parseInt(backupDays, 10);
    if (Number.isFinite(n)) out.BACKUP_MAX_AGE_DAYS = n;
  }
  const backupHours = process.env.BACKUP_RUN_MAX_AGE_HOURS?.trim();
  if (backupHours) {
    const n = parseInt(backupHours, 10);
    if (Number.isFinite(n)) out.BACKUP_RUN_MAX_AGE_HOURS = n;
  }
  const backupBytes = process.env.BACKUP_MIN_SIZE_WARNING_BYTES?.trim();
  if (backupBytes) {
    const n = parseInt(backupBytes, 10);
    if (Number.isFinite(n)) out.BACKUP_MIN_SIZE_WARNING_BYTES = n;
  }
  return out;
}

function envSeedTrusted(): TrustedConfig {
  return {
    loginIps: splitIps(process.env.TRUSTED_LOGIN_IPS),
    outboundIps: splitIps(process.env.TRUSTED_OUTBOUND_IPS),
  };
}

let cache: Cache = defaultsCache();
let ready = false;
let loading: Promise<void> | null = null;

export function getCachedThreshold(
  name: string,
  fallback: number,
): number {
  const key = name.toUpperCase() as ThresholdKey;
  const v = cache.thresholds[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function getCachedTrustedLoginIps(): ReadonlySet<string> {
  return new Set(cache.trusted.loginIps);
}

export function getCachedTrustedOutboundIps(): ReadonlySet<string> {
  return new Set([
    ...cache.trusted.loginIps,
    ...cache.trusted.outboundIps,
  ]);
}

export function getRuntimeConfigSnapshot(): {
  thresholds: ThresholdsMap;
  trusted: TrustedConfig;
  ready: boolean;
} {
  return {
    thresholds: { ...cache.thresholds },
    trusted: {
      loginIps: [...cache.trusted.loginIps],
      outboundIps: [...cache.trusted.outboundIps],
    },
    ready,
  };
}

async function ensureSiblingRuntimeBlobs(): Promise<void> {
  await ensureAllowlistsConfig().catch(() => null);
  await ensureOpsConfig().catch(() => null);
}

export async function ensureRuntimeConfig(): Promise<void> {
  if (ready) {
    await ensureSiblingRuntimeBlobs();
    return;
  }
  if (loading) return loading;
  loading = (async () => {
    try {
      let storedTh = await getSetting<unknown>(THRESHOLDS_KEY);
      let storedTr = await getSetting<unknown>(TRUSTED_KEY);

      if (storedTh == null) {
        const seeded = {
          ...DEFAULT_THRESHOLDS,
          ...envSeedThresholds(),
        };
        await setSetting(THRESHOLDS_KEY, seeded);
        storedTh = seeded;
      }
      if (storedTr == null) {
        const seeded = envSeedTrusted();
        await setSetting(TRUSTED_KEY, seeded);
        storedTr = seeded;
      }

      cache = {
        thresholds: {
          ...DEFAULT_THRESHOLDS,
          ...parseThresholds(storedTh),
        },
        trusted: parseTrusted(storedTr),
      };
      ready = true;
      await ensureSiblingRuntimeBlobs();
    } catch {
      cache = defaultsCache();
      ready = false;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export async function updateThresholds(
  patch: Partial<ThresholdsMap>,
): Promise<ThresholdsMap> {
  await ensureRuntimeConfig();
  const next: ThresholdsMap = {
    ...cache.thresholds,
    ...parseThresholds(patch),
  };
  await setSetting(THRESHOLDS_KEY, next);
  cache = { ...cache, thresholds: next };
  ready = true;
  return next;
}

export async function updateTrustedConfig(
  input: Partial<TrustedConfig> & {
    loginIpsRaw?: string;
    outboundIpsRaw?: string;
  },
): Promise<TrustedConfig> {
  await ensureRuntimeConfig();
  const next: TrustedConfig = {
    loginIps:
      input.loginIpsRaw != null
        ? splitIps(input.loginIpsRaw)
        : input.loginIps != null
          ? input.loginIps.map((s) => s.trim()).filter(Boolean)
          : [...cache.trusted.loginIps],
    outboundIps:
      input.outboundIpsRaw != null
        ? splitIps(input.outboundIpsRaw)
        : input.outboundIps != null
          ? input.outboundIps.map((s) => s.trim()).filter(Boolean)
          : [...cache.trusted.outboundIps],
  };
  await setSetting(TRUSTED_KEY, next);
  cache = { ...cache, trusted: next };
  ready = true;
  return next;
}

/** Test helper */
export function resetRuntimeConfigForTests(): void {
  cache = defaultsCache();
  ready = false;
  loading = null;
}
