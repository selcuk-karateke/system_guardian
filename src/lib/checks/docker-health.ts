/**
 * Docker HEALTHCHECK / Status-Parsing.
 * Unhealthy Container sind oft weiterhin State=running ("Up … (unhealthy)").
 */

export function isDockerStatusUnhealthy(status: string, state?: string): boolean {
  const s = status.toLowerCase();
  if (s.includes("unhealthy")) return true;
  // defensiv: manches Format nur im State
  if ((state ?? "").toLowerCase().includes("unhealthy")) return true;
  return false;
}

export function isDockerStatusRestarting(status: string, state?: string): boolean {
  const s = `${status} ${state ?? ""}`.toLowerCase();
  return s.includes("restarting");
}

/** Severity: running+unhealthy = warning (recoverable); dead/unhealthy oddities = critical handled elsewhere */
export function unhealthyAlertLevel(
  state: string,
): "warning" | "critical" {
  return state === "running" ? "warning" : "critical";
}
