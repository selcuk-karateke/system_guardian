import type { CheckStatus } from "@/lib/checks/types";

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
  const raw = process.env.BACKUP_PATHS ?? "/var/backups/postgres,/var/backups/docker,/var/backups/coolify";
  return raw.split(",").map((p) => p.trim()).filter(Boolean);
}

export function worstStatus(
  statuses: CheckStatus[],
): CheckStatus {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  return "healthy";
}
