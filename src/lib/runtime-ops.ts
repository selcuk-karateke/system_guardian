import { getSetting, setSetting } from "@/lib/app-settings";

const OPS_KEY = "runtime.ops";

export type OpsConfig = {
  trivyCronEnabled: boolean;
  trivyScanLimit: number;
  trivyMaxAgeDays: number;
  monitorNightMode: boolean;
  monitorNightStart: number;
  monitorNightEnd: number;
  monitorPixelShiftSec: number;
  observationHours: number;
  incidentUseFixedWindow: boolean;
  incidentLogSince: string;
  incidentLogUntil: string;
  raidCheckEnabled: boolean;
};

export const DEFAULT_OPS: OpsConfig = {
  trivyCronEnabled: true,
  trivyScanLimit: 8,
  trivyMaxAgeDays: 7,
  monitorNightMode: true,
  monitorNightStart: 22,
  monitorNightEnd: 7,
  monitorPixelShiftSec: 180,
  observationHours: 24,
  incidentUseFixedWindow: false,
  incidentLogSince: "2026-06-02T07:15:00",
  incidentLogUntil: "2026-06-02T07:45:00",
  raidCheckEnabled: true,
};

let cache: OpsConfig = { ...DEFAULT_OPS };
let ready = false;
let loading: Promise<void> | null = null;

function clampInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? parseInt(raw, 10)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseBool(raw: unknown, fallback: boolean): boolean {
  if (raw === true || raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === false || raw === "false" || raw === 0 || raw === "0") return false;
  return fallback;
}

function parseIsoLocal(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  // Accept YYYY-MM-DDTHH:MM:SS (optional Z / offset stripped to local-ish)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(s)) return fallback;
  return s.slice(0, 19);
}

function parseOps(raw: unknown): OpsConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_OPS };
  const o = raw as Record<string, unknown>;
  return {
    trivyCronEnabled: parseBool(o.trivyCronEnabled, DEFAULT_OPS.trivyCronEnabled),
    trivyScanLimit: clampInt(o.trivyScanLimit, DEFAULT_OPS.trivyScanLimit, 1, 20),
    trivyMaxAgeDays: clampInt(
      o.trivyMaxAgeDays,
      DEFAULT_OPS.trivyMaxAgeDays,
      1,
      90,
    ),
    monitorNightMode: parseBool(
      o.monitorNightMode,
      DEFAULT_OPS.monitorNightMode,
    ),
    monitorNightStart: clampInt(
      o.monitorNightStart,
      DEFAULT_OPS.monitorNightStart,
      0,
      23,
    ),
    monitorNightEnd: clampInt(
      o.monitorNightEnd,
      DEFAULT_OPS.monitorNightEnd,
      0,
      23,
    ),
    monitorPixelShiftSec: clampInt(
      o.monitorPixelShiftSec,
      DEFAULT_OPS.monitorPixelShiftSec,
      30,
      3600,
    ),
    observationHours: clampInt(
      o.observationHours,
      DEFAULT_OPS.observationHours,
      1,
      168,
    ),
    incidentUseFixedWindow: parseBool(
      o.incidentUseFixedWindow,
      DEFAULT_OPS.incidentUseFixedWindow,
    ),
    incidentLogSince: parseIsoLocal(
      o.incidentLogSince,
      DEFAULT_OPS.incidentLogSince,
    ),
    incidentLogUntil: parseIsoLocal(
      o.incidentLogUntil,
      DEFAULT_OPS.incidentLogUntil,
    ),
    raidCheckEnabled: parseBool(
      o.raidCheckEnabled,
      DEFAULT_OPS.raidCheckEnabled,
    ),
  };
}

/** One-time seed from ENV when settings key is missing. */
function envSeedOps(): OpsConfig {
  const base = { ...DEFAULT_OPS };
  if (process.env.TRIVY_CRON_ENABLED != null) {
    base.trivyCronEnabled = process.env.TRIVY_CRON_ENABLED !== "false";
  }
  if (process.env.TRIVY_SCAN_LIMIT != null) {
    base.trivyScanLimit = clampInt(
      process.env.TRIVY_SCAN_LIMIT,
      base.trivyScanLimit,
      1,
      20,
    );
  }
  if (process.env.TRIVY_MAX_AGE_DAYS != null) {
    base.trivyMaxAgeDays = clampInt(
      process.env.TRIVY_MAX_AGE_DAYS,
      base.trivyMaxAgeDays,
      1,
      90,
    );
  }
  if (process.env.MONITOR_NIGHT_MODE != null) {
    base.monitorNightMode = process.env.MONITOR_NIGHT_MODE !== "false";
  }
  if (process.env.MONITOR_NIGHT_START != null) {
    base.monitorNightStart = clampInt(
      process.env.MONITOR_NIGHT_START,
      base.monitorNightStart,
      0,
      23,
    );
  }
  if (process.env.MONITOR_NIGHT_END != null) {
    base.monitorNightEnd = clampInt(
      process.env.MONITOR_NIGHT_END,
      base.monitorNightEnd,
      0,
      23,
    );
  }
  if (process.env.MONITOR_PIXEL_SHIFT_SEC != null) {
    base.monitorPixelShiftSec = clampInt(
      process.env.MONITOR_PIXEL_SHIFT_SEC,
      base.monitorPixelShiftSec,
      30,
      3600,
    );
  }
  if (process.env.OBSERVATION_HOURS != null) {
    base.observationHours = clampInt(
      process.env.OBSERVATION_HOURS,
      base.observationHours,
      1,
      168,
    );
  }
  if (process.env.INCIDENT_USE_FIXED_WINDOW != null) {
    base.incidentUseFixedWindow =
      process.env.INCIDENT_USE_FIXED_WINDOW === "true";
  }
  if (process.env.INCIDENT_LOG_SINCE != null) {
    base.incidentLogSince = parseIsoLocal(
      process.env.INCIDENT_LOG_SINCE,
      base.incidentLogSince,
    );
  }
  if (process.env.INCIDENT_LOG_UNTIL != null) {
    base.incidentLogUntil = parseIsoLocal(
      process.env.INCIDENT_LOG_UNTIL,
      base.incidentLogUntil,
    );
  }
  if (process.env.RAID_CHECK_ENABLED != null) {
    base.raidCheckEnabled = process.env.RAID_CHECK_ENABLED !== "false";
  }
  return base;
}

export function getCachedOps(): OpsConfig {
  return { ...cache };
}

export async function ensureOpsConfig(): Promise<void> {
  if (ready) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      let stored = await getSetting<unknown>(OPS_KEY);
      if (stored == null) {
        const seeded = envSeedOps();
        await setSetting(OPS_KEY, seeded);
        stored = seeded;
      }
      cache = parseOps(stored);
      ready = true;
    } catch {
      cache = { ...DEFAULT_OPS };
      ready = false;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export type OpsUpdateInput = Partial<OpsConfig>;

export async function updateOpsConfig(
  input: OpsUpdateInput,
): Promise<OpsConfig> {
  await ensureOpsConfig();
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) patch[k] = v;
  }
  const next = parseOps({ ...cache, ...patch });
  await setSetting(OPS_KEY, next);
  cache = next;
  ready = true;
  return getCachedOps();
}

/** Test helper */
export function resetOpsConfigForTests(): void {
  cache = { ...DEFAULT_OPS };
  ready = false;
  loading = null;
}
