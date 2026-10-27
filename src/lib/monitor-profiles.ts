/**
 * Monitoring-Profile je Zieltyp (Marco):
 * - host: voller Coolify-/Debian-Host (RAID, SSH, Users, …)
 * - container: App-/Service-Fokus — Host-Härtung & RAID weglassen
 * - full: Alias für host (explizit alles)
 */

export const MONITOR_PROFILES = ["host", "container", "full"] as const;
export type MonitorProfile = (typeof MONITOR_PROFILES)[number];

export function parseMonitorProfile(raw: string | null | undefined): MonitorProfile {
  const v = (raw ?? "host").trim().toLowerCase();
  if (v === "container" || v === "app") return "container";
  if (v === "full") return "full";
  return "host";
}

/** Module die im container-Profil laufen (Allowlist). */
export const CONTAINER_PROFILE_MODULES = new Set([
  "server_health",
  "docker",
  "coolify",
  "database",
  "ssl",
  "website",
  "ports",
  "logs",
  "processes",
  "network",
  "web_presence",
  "security_posture",
  "trivy",
]);

/** Module die nur auf Host/Full Sinn ergeben. */
export const HOST_ONLY_MODULES = new Set([
  "raid",
  "backups",
  "fim",
  "ssh_keys",
  "users",
  "logins",
  "cron",
  "scanner",
  "services",
]);

export function profileAllowsModule(
  profile: MonitorProfile,
  moduleId: string,
): boolean {
  if (profile === "host" || profile === "full") return true;
  return CONTAINER_PROFILE_MODULES.has(moduleId);
}

export function profileLabel(profile: MonitorProfile): string {
  if (profile === "container") return "Container / App";
  if (profile === "full") return "Full";
  return "Host";
}
