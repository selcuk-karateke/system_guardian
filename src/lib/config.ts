import type { CheckStatus } from "@/lib/checks/types";
import {
  DEFAULT_THRESHOLDS,
  getCachedThreshold,
  getCachedTrustedLoginIps,
  getCachedTrustedOutboundIps,
} from "@/lib/runtime-config";

export function getCheckMode(): "mock" | "ssh" {
  return process.env.CHECK_MODE === "ssh" ? "ssh" : "mock";
}

/** Thresholds from DB settings (runtime-config cache). */
export function getThreshold(name: string, fallback: number): number {
  return getCachedThreshold(name, fallback);
}

export const THRESHOLDS = {
  cpuWarning: () =>
    getThreshold("CPU_WARNING", DEFAULT_THRESHOLDS.CPU_WARNING),
  cpuCritical: () =>
    getThreshold("CPU_CRITICAL", DEFAULT_THRESHOLDS.CPU_CRITICAL),
  ramWarning: () =>
    getThreshold("RAM_WARNING", DEFAULT_THRESHOLDS.RAM_WARNING),
  ramCritical: () =>
    getThreshold("RAM_CRITICAL", DEFAULT_THRESHOLDS.RAM_CRITICAL),
  diskWarning: () =>
    getThreshold("DISK_WARNING", DEFAULT_THRESHOLDS.DISK_WARNING),
  diskCritical: () =>
    getThreshold("DISK_CRITICAL", DEFAULT_THRESHOLDS.DISK_CRITICAL),
  processCpuWarning: () =>
    getThreshold("PROCESS_CPU_WARNING", DEFAULT_THRESHOLDS.PROCESS_CPU_WARNING),
  dockerCpuWarning: () =>
    getThreshold("DOCKER_CPU_WARNING", DEFAULT_THRESHOLDS.DOCKER_CPU_WARNING),
  dockerMemWarning: () =>
    getThreshold("DOCKER_MEM_WARNING", DEFAULT_THRESHOLDS.DOCKER_MEM_WARNING),
  egressMbpsWarning: () =>
    getThreshold("EGRESS_MBPS_WARNING", DEFAULT_THRESHOLDS.EGRESS_MBPS_WARNING),
  egressMbpsCritical: () =>
    getThreshold(
      "EGRESS_MBPS_CRITICAL",
      DEFAULT_THRESHOLDS.EGRESS_MBPS_CRITICAL,
    ),
  egressMbWarning: () =>
    getThreshold("EGRESS_MB_WARNING", DEFAULT_THRESHOLDS.EGRESS_MB_WARNING),
  egressMbCritical: () =>
    getThreshold("EGRESS_MB_CRITICAL", DEFAULT_THRESHOLDS.EGRESS_MB_CRITICAL),
};

/** @deprecated Paths live on the server row — resolveBackupConfig(serverId). */
export function getBackupPaths(): string[] {
  return "/backups/daily,/backups/monthly,/data/coolify/backups"
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Root/SSH login IPs (DB settings via runtime-config). */
export function getTrustedLoginIps(): Set<string> {
  return new Set(getCachedTrustedLoginIps());
}

/** Login-IP vertrauenswürdig (explizit oder internes 10.0.1.* wie bei Outbound). */
export function isTrustedLoginIp(ip: string): boolean {
  if (getTrustedLoginIps().has(ip)) return true;
  return /^10\.0\.1\.\d{1,3}$/.test(ip);
}

/** Outbound peers (merged with login IPs) from DB settings. */
export function getTrustedOutboundIps(): Set<string> {
  return new Set(getCachedTrustedOutboundIps());
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

/**
 * Coolify/Compose DB-Migrate-Jobs (api-migrate, db-migrate, …) — one-shot.
 * Exit 0 = erwartet gestoppt; Exit ≠ 0 = eigener Alert (nicht „unexpected stop“).
 */
export function isMigrateOneShotContainer(name: string): boolean {
  const n = name.toLowerCase();
  return (
    /(^|[-_/])(api-)?migrate([-_/]|$)/.test(n) ||
    /(^|[-_/])db-migrate([-_/]|$)/.test(n)
  );
}

/**
 * Coolify / Docker Buildx builders (railpack, buildkit) — high CPU during deploys is expected.
 * Skip docker-stats resource WARN so deploy spikes do not page as “miner / traffic spike”.
 */
export function isBuildInfraContainer(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("buildkit") ||
    n.includes("buildx") ||
    n.includes("railpack")
  );
}

/** Exit-Code aus `docker ps` Status, z. B. `Exited (0) 2 days ago`. */
export function parseDockerExitedCode(status: string): number | null {
  const m = /Exited\s*\((\d+)\)/i.exec(status);
  if (!m) return null;
  return parseInt(m[1]!, 10);
}

/** Critical if newest backup across all paths is older than this (days). */
export function getBackupMaxAgeDays(): number {
  return getThreshold(
    "BACKUP_MAX_AGE_DAYS",
    DEFAULT_THRESHOLDS.BACKUP_MAX_AGE_DAYS,
  );
}

/** @deprecated Prefer resolveBackupConfig(serverId). */
export function getBackupMonitoringDir(): string {
  return "/backups/monitoring";
}

/**
 * Critical if status.json finished_at is older than this (hours).
 * Daily cron 01:00 → default 36h catches a missed night.
 */
export function getBackupRunMaxAgeHours(): number {
  const n = getThreshold(
    "BACKUP_RUN_MAX_AGE_HOURS",
    DEFAULT_THRESHOLDS.BACKUP_RUN_MAX_AGE_HOURS,
  );
  return n > 0 ? n : DEFAULT_THRESHOLDS.BACKUP_RUN_MAX_AGE_HOURS;
}

/** Warning if best backup is smaller than this (bytes); 0-byte is always critical. */
export function getBackupMinSizeWarningBytes(): number {
  return getThreshold(
    "BACKUP_MIN_SIZE_WARNING_BYTES",
    DEFAULT_THRESHOLDS.BACKUP_MIN_SIZE_WARNING_BYTES,
  );
}

/** @deprecated Prefer resolveBackupConfig(serverId). */
export function getBackupTriggerCommand(): string {
  return "";
}

/** @deprecated Prefer resolveBackupConfig(serverId).triggerCommand. */
export function isBackupTriggerEnabled(): boolean {
  return false;
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

/** @deprecated Prefer resolveCoolifyApi(serverId). */
export function getCoolifyApiUrl(): string | null {
  return null;
}

/** @deprecated Prefer resolveCoolifyApi(serverId). */
export function getCoolifyApiToken(): string | null {
  return null;
}

/** @deprecated Prefer isCoolifyRedeployConfiguredForServer(serverId). */
export function isCoolifyRedeployConfigured(): boolean {
  return false;
}

/** Security-Cron: Trivy-Batch für ungecachte/alte Images (default an). */
export function isTrivyCronEnabled(): boolean {
  return process.env.TRIVY_CRON_ENABLED !== "false";
}

/** Max container scans per trivy check run (default 8 — Trivy ist langsam). */
export function getTrivyScanLimit(): number {
  const v = process.env.TRIVY_SCAN_LIMIT;
  const n = v ? parseInt(v, 10) : 8;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 8;
}

/** Rescan if cached result older than N days (default 7). */
export function getTrivyMaxAgeDays(): number {
  const v = process.env.TRIVY_MAX_AGE_DAYS;
  return v ? parseInt(v, 10) : 7;
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
