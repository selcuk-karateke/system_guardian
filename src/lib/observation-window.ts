import {
  getIncidentLogSince,
  getIncidentLogUntil,
  getObservationHours,
  isIncidentFixedWindowEnabled,
} from "@/lib/config";

export interface ObservationWindow {
  since: string;
  until: string;
  mode: "rolling" | "fixed";
  hours?: number;
}

/** Rolling window for ongoing monitoring (default). */
export function getRollingObservationWindow(hours?: number): ObservationWindow {
  const h = hours ?? getObservationHours();
  const until = new Date();
  const since = new Date(until.getTime() - h * 3600 * 1000);
  return {
    since: toIsoLocal(since),
    until: toIsoLocal(until),
    mode: "rolling",
    hours: h,
  };
}

export function getFixedIncidentWindow(): ObservationWindow {
  return {
    since: getIncidentLogSince(),
    until: getIncidentLogUntil(),
    mode: "fixed",
  };
}

/** Log/journal checks: rolling window unless fixed incident window is enabled. */
export function getActiveObservationWindow(): ObservationWindow {
  if (isIncidentFixedWindowEnabled()) {
    return getFixedIncidentWindow();
  }
  return getRollingObservationWindow();
}

export function journalSinceArg(iso: string): string {
  return iso.replace("T", " ");
}

function toIsoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function parseQueryWindow(
  fromParam?: string | null,
  toParam?: string | null,
): ObservationWindow {
  if (fromParam && toParam) {
    return {
      since: fromParam,
      until: toParam,
      mode: "fixed",
    };
  }
  return getRollingObservationWindow();
}
