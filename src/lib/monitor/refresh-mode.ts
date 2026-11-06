/** Monitor wall / egress preference (per browser). */

export type MonitorRefreshMode = "off" | "30" | "60" | "300" | "live";

export type MonitorRefreshOption = {
  value: MonitorRefreshMode;
  label: string;
  /** Full RSC/wall refresh; 0 = off */
  wallSec: number;
  /** Poll agent egress */
  live: boolean;
  /** Egress poll interval (ms); ignored when live=false */
  egressMs: number;
};

export const MONITOR_REFRESH_OPTIONS: readonly MonitorRefreshOption[] = [
  { value: "off", label: "Aus", wallSec: 0, live: false, egressMs: 0 },
  { value: "30", label: "30s", wallSec: 30, live: true, egressMs: 30_000 },
  { value: "60", label: "1 Min", wallSec: 60, live: true, egressMs: 60_000 },
  { value: "300", label: "5 Min", wallSec: 300, live: true, egressMs: 300_000 },
  // Live: fast vitals poll + slow wall refresh so tiles/alerts don't go stale
  { value: "live", label: "Live", wallSec: 300, live: true, egressMs: 5_000 },
] as const;

export const MONITOR_REFRESH_STORAGE_KEY = "sg-monitor-refresh";
export const DEFAULT_MONITOR_REFRESH_MODE: MonitorRefreshMode = "live";

/** Survives client remounts within the same tab (avoids 1 Min ↔ Live flash). */
let memoryMode: MonitorRefreshMode | null = null;

export function parseMonitorRefreshMode(
  raw: string | null | undefined,
): MonitorRefreshMode {
  const v = (raw ?? "").trim();
  if (MONITOR_REFRESH_OPTIONS.some((o) => o.value === v)) {
    return v as MonitorRefreshMode;
  }
  return DEFAULT_MONITOR_REFRESH_MODE;
}

export function getMonitorRefreshOption(
  mode: MonitorRefreshMode,
): MonitorRefreshOption {
  return (
    MONITOR_REFRESH_OPTIONS.find((o) => o.value === mode) ??
    MONITOR_REFRESH_OPTIONS.find((o) => o.value === DEFAULT_MONITOR_REFRESH_MODE)!
  );
}

export function readMonitorRefreshMode(): MonitorRefreshMode {
  if (memoryMode) return memoryMode;
  if (typeof window === "undefined") return DEFAULT_MONITOR_REFRESH_MODE;
  try {
    memoryMode = parseMonitorRefreshMode(
      window.localStorage.getItem(MONITOR_REFRESH_STORAGE_KEY),
    );
    return memoryMode;
  } catch {
    memoryMode = DEFAULT_MONITOR_REFRESH_MODE;
    return memoryMode;
  }
}

export function writeMonitorRefreshMode(mode: MonitorRefreshMode): void {
  memoryMode = mode;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MONITOR_REFRESH_STORAGE_KEY, mode);
  } catch {
    /* private mode */
  }
}
