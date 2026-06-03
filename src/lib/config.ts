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
};

export function getBackupPaths(): string[] {
  const raw =
    process.env.BACKUP_PATHS ?? "/data/coolify/backups,/root";
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

/** Stopped containers matching these name patterns are expected (no docker warning) */
export function getExpectedStoppedContainers(): string[] {
  const raw =
    process.env.EXPECTED_STOPPED_CONTAINERS ??
    "nextcloud-aio-mastercontainer";
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
