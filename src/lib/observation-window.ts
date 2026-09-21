import {
  getIncidentLogSince,
  getIncidentLogUntil,
} from "@/lib/config";

export interface ObservationWindow {
  since: string;
  until: string;
  mode: "rolling" | "fixed";
  hours?: number;
}

/** Rolling window for ongoing monitoring (default). */
export function getRollingObservationWindow(hours?: number): ObservationWindow {
  const h =
    hours ??
    (process.env.OBSERVATION_HOURS
      ? parseInt(process.env.OBSERVATION_HOURS, 10)
      : 24);
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

/** Log/journal checks: rolling 24h unless INCIDENT_USE_FIXED_WINDOW=true */
export function getActiveObservationWindow(): ObservationWindow {
  if (process.env.INCIDENT_USE_FIXED_WINDOW === "true") {
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
