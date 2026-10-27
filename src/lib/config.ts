import type { CheckStatus } from "@/lib/checks/types";

export function getCheckMode(): "mock" | "ssh" {
  return process.env.CHECK_MODE === "ssh" ? "ssh" : "mock";
}

export function getThreshold(name: string, fallback: number): number {
  const envKey = `THRESHOLD_${name.toUpperCase()}`;
  const val = process.env[envKey];
  if (val) return parseInt(val, 10);
  return fallback;
}

export const THRESHOLDS = {
  cpuWarning: () => getThreshold("CPU_WARNING", 80),
  cpuCritical: () => getThreshold("CPU_CRITICAL", 95),
  ramWarning: () => getThreshold("RAM_WARNING", 85),
  ramCritical: () => getThreshold("RAM_CRITICAL", 95),
  diskWarning: () => getThreshold("DISK_WARNING", 85),
  diskCritical: () => getThreshold("DISK_CRITICAL", 95),
  processCpuWarning: () => getThreshold("PROCESS_CPU_WARNING", 90),
  dockerCpuWarning: () => getThreshold("DOCKER_CPU_WARNING", 85),
  dockerMemWarning: () => getThreshold("DOCKER_MEM_WARNING", 90),
};

export function getBackupPaths(): string[] {
  const raw =
    process.env.BACKUP_PATHS ??
    "/backups/daily,/backups/monthly,/data/coolify/backups";
  return raw.split(",").map((p) => p.trim()).filter(Boolean);
}

/** Root/SSH login IPs that do not trigger logins warnings */
export function getTrustedLoginIps(): Set<string> {
  const raw = process.env.TRUSTED_LOGIN_IPS ?? "";
  return new Set(
    raw
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean),
  );
}

/** Login-IP vertrauenswürdig (explizit oder internes 10.0.1.* wie bei Outbound). */
export function isTrustedLoginIp(ip: string): boolean {
  if (getTrustedLoginIps().has(ip)) return true;
  return /^10\.0\.1\.\d{1,3}$/.test(ip);
}

/** Outbound peers that must not raise network baseline WARNs (merged with login IPs) */
export function getTrustedOutboundIps(): Set<string> {
  const raw = process.env.TRUSTED_OUTBOUND_IPS ?? "";
  const extra = raw
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  return new Set([...getTrustedLoginIps(), ...extra]);
}

/** True if ss connection key / alert text involves a trusted or internal peer */
export function isTrustedOutboundKey(key: string): boolean {
  if (/127\.0\.0\.1|::1|localhost/i.test(key)) return true;
  if (/10\.0\.1\.\d{1,3}/.test(key)) return true;
  for (const ip of getTrustedOutboundIps()) {
    if (ip && key.includes(ip)) return true;
  }
  return false;
}

/** Stopped containers matching these name patterns are expected (no docker warning) */
export function getExpectedStoppedContainers(): string[] {
  const raw =
    process.env.EXPECTED_STOPPED_CONTAINERS ??
    "nextcloud-aio-mastercontainer";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** systemd failed units that are benign (e.g. chkrootkit without mail) */
export function getExpectedFailedUnits(): string[] {
  const raw =
    process.env.EXPECTED_FAILED_UNITS ?? "chkrootkit.service";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function maskLoginIp(ip: string): string {
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.xxx.xxx`;
  return ip;
}

export function isExpectedStoppedContainer(name: string): boolean {
  const lower = name.toLowerCase();
  return getExpectedStoppedContainers().some((pattern) =>
    lower.includes(pattern.toLowerCase()),
  );
}

/** Critical if newest backup across all paths is older than this (days). */
export function getBackupMaxAgeDays(): number {
  const v = process.env.BACKUP_MAX_AGE_DAYS;
  return v ? parseInt(v, 10) : 7;
}

/** Warning if best backup is smaller than this (bytes); 0-byte is always critical. */
export function getBackupMinSizeWarningBytes(): number {
  const v = process.env.BACKUP_MIN_SIZE_WARNING_BYTES;
  return v ? parseInt(v, 10) : 10 * 1024 * 1024;
}

/**
 * Optional absolute path on SSH host to start a backup job (Settings → Schutz).
 * Empty = disabled. No shell metacharacters — see validateBackupTriggerCommand.
 */
export function getBackupTriggerCommand(): string {
  return (process.env.BACKUP_TRIGGER_COMMAND ?? "").trim();
}

export function isBackupTriggerEnabled(): boolean {
  return getBackupTriggerCommand().length > 0;
}

/**
 * Opt-in: when true, network/security checks may ban IPs that are already on
 * BLOCKED_REMOTE_IPS via fail2ban. Never bans unknown IPs.
 */
export function isAutoBlockEnabled(): boolean {
  return process.env.AUTO_BLOCK_ENABLED === "true";
}

export function getAutoBlockJail(): string {
  const jail = (process.env.AUTO_BLOCK_JAIL ?? "sshd").trim();
  return /^[a-zA-Z0-9_-]+$/.test(jail) ? jail : "sshd";
}

/** TV monitor: night mode start hour (local browser time, 0–23). */
export function getMonitorNightStartHour(): number {
  const v = process.env.MONITOR_NIGHT_START;
  return v ? parseInt(v, 10) : 22;
}

/** TV monitor: night mode end hour (local browser time, 0–23). */
export function getMonitorNightEndHour(): number {
  const v = process.env.MONITOR_NIGHT_END;
  return v ? parseInt(v, 10) : 7;
}

/** TV monitor: pixel-shift cycle interval in seconds. */
export function getMonitorPixelShiftSec(): number {
  const v = process.env.MONITOR_PIXEL_SHIFT_SEC;
  return v ? parseInt(v, 10) : 180;
}

export function isMonitorNightModeEnabled(): boolean {
  return process.env.MONITOR_NIGHT_MODE !== "false";
}

/** Docker image prefixes considered trusted (comma-separated, case-insensitive prefix match) */
export function getKnownDockerImagePrefixes(): string[] {
  const raw =
    process.env.KNOWN_DOCKER_IMAGE_PREFIXES ??
    "coolifyio/,ghcr.io/coolify,traefik:,postgres:,redis:,mysql:,mariadb:,nginx:,alpine:";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** BSI / incident domains for log grep (comma-separated) */
export function getIncidentIocDomains(): string[] {
  const raw =
    process.env.INCIDENT_IOC_DOMAINS ??
    "xlgelllulyrhpbjmn.org,yxmvknylyxtt.org";
  return raw.split(",").map((d) => d.trim()).filter(Boolean);
}

export function getIncidentLogSince(): string {
  return process.env.INCIDENT_LOG_SINCE ?? "2026-06-02T07:15:00";
}

export function getIncidentLogUntil(): string {
  return process.env.INCIDENT_LOG_UNTIL ?? "2026-06-02T07:45:00";
}

/** Outbound IPs from incident reports (e.g. BSI) – always CRITICAL if seen in ss */
export function getBlockedRemoteIps(): Set<string> {
  const raw =
    process.env.BLOCKED_REMOTE_IPS ?? "216.218.185.162";
  return new Set(
    raw
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean),
  );
}

/** Processes allowed for outbound ESTAB to public :80/:443 without warning */
export function getTrustedOutboundProcessPatterns(): RegExp[] {
  const raw = process.env.TRUSTED_OUTBOUND_PROCESSES ?? "";
  const defaults = [
    /docker-proxy/i,
    /containerd/i,
    /traefik/i,
    /nginx/i,
    /apt-get/i,
    /unattended-upgrade/i,
    /** Coolify-App Hermes Agent/WebUI — bekannter Telegram/CF-Outbound */
    /hermes/i,
  ];
  if (!raw.trim()) return defaults;
  return [
    ...defaults,
    ...raw.split(",").map((s) => new RegExp(s.trim(), "i")).filter((r) => r.source),
  ];
}

/**
 * `ps aux` lines with sh/bash -c that are benign (Coolify deploy, Node start).
 * Extra regex fragments via TRUSTED_SHELL_PROCESS_PATTERNS (comma-separated).
 */
export function getTrustedShellProcessPatterns(): RegExp[] {
  const raw = process.env.TRUSTED_SHELL_PROCESS_PATTERNS ?? "";
  const defaults = [
    /sh -c (next start|npm start|node dist|prisma)/i,
    /\/bin\/sh -c npm/i,
    /prisma migrate deploy/i,
    /npx prisma/i,
    /scripts\/start\.js/i,
    /ensure-initial-data/i,
    /DATABASE_URL.*Coolify/i,
    /JWT_SECRET.*Coolify/i,
    /CORS_ORIGIN.*Coolify/i,
    /next-server/i,
    /node\s+.*\/node_modules/i,
    /** Hermes WebUI / Agent Start auf Coolify */
    /hermeswebui_init\.bash/i,
    /hermes.*\.(bash|sh)\b/i,
  ];
  if (!raw.trim()) return defaults;
  return [
    ...defaults,
    ...raw.split(",").map((s) => new RegExp(s.trim(), "i")).filter((r) => r.source),
  ];
}

/** File Integrity Monitoring – critical paths to hash over SSH */
export function getFimPaths(): string[] {
  const raw =
    process.env.FIM_PATHS ??
    "/etc/passwd,/etc/ssh/sshd_config,/etc/sudoers,/root/.ssh/authorized_keys";
  return raw.split(",").map((p) => p.trim()).filter(Boolean);
}

export function worstStatus(
  statuses: CheckStatus[],
): CheckStatus {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  return "healthy";
}
