import { getBackupPaths } from "@/lib/config";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

const MAX_AGE_HOURS = 48;
const MIN_SIZE_BYTES = 1024;

export async function runBackupsCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = getSshClient();
  const paths = getBackupPaths();
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const backupStatus: Record<string, unknown> = {};

  for (const basePath of paths) {
    const { stdout } = await ssh.exec(
      `find ${basePath} -type f -printf '%T@ %s %p\\n' 2>/dev/null | sort -rn | head -5`,
    );
    const files = stdout.trim().split("\n").filter(Boolean);

    if (files.length === 0) {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `No backups found in ${basePath}`,
        recommendation: "Verify backup cron job is running",
      });
      backupStatus[basePath] = { found: false };
      continue;
    }

    const latest = files[0].split(" ");
    const mtime = parseFloat(latest[0]);
    const size = parseInt(latest[1], 10);
    const ageHours = (Date.now() / 1000 - mtime) / 3600;

    backupStatus[basePath] = { ageHours, sizeBytes: size, latest: latest[2] };

    if (ageHours > MAX_AGE_HOURS) {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `Backup in ${basePath} is ${Math.round(ageHours)}h old`,
      });
    }
    if (size < MIN_SIZE_BYTES) {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `Backup in ${basePath} suspiciously small (${size} bytes)`,
      });
    }
  }

  return {
    module: "backups",
    status,
    data: { paths: backupStatus },
    alerts,
  };
}
