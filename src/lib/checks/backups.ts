import {
  getBackupMaxAgeDays,
  getBackupMinSizeWarningBytes,
  getBackupPaths,
} from "@/lib/config";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

export type BackupFileInfo = {
  path: string;
  mtimeSec: number;
  sizeBytes: number;
  ageHours: number;
  ageDays: number;
};

function shellQuote(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

function parseFindLine(line: string): BackupFileInfo | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const mtimeSec = parseFloat(parts[0]);
  const sizeBytes = parseInt(parts[1], 10);
  const filePath = parts.slice(2).join(" ");
  if (!Number.isFinite(mtimeSec) || !Number.isFinite(sizeBytes)) return null;
  const ageHours = (Date.now() / 1000 - mtimeSec) / 3600;
  return {
    path: filePath,
    mtimeSec,
    sizeBytes,
    ageHours,
    ageDays: ageHours / 24,
  };
}

async function expandBackupPaths(patterns: string[]): Promise<string[]> {
  const ssh = getSshClient();
  const resolved: string[] = [];

  for (const pattern of patterns) {
    if (!/[*?[\]]/.test(pattern)) {
      resolved.push(pattern);
      continue;
    }
    const q = shellQuote(pattern);
    const { stdout } = await ssh.exec(`ls -1d ${q} 2>/dev/null`);
    const matches = stdout
      .trim()
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    resolved.push(...matches);
  }

  return resolved;
}

async function scanBackupPath(
  basePath: string,
): Promise<{ path: string; latest: BackupFileInfo | null; fileCount: number }> {
  const ssh = getSshClient();
  const q = shellQuote(basePath);
  const { stdout } = await ssh.exec(
    `if [ -f ${q} ]; then stat -c '%Y %s %n' ${q} 2>/dev/null; ` +
      `elif [ -d ${q} ]; then ` +
      `find ${q} -type f ! -name '.*' \\( -name '*.tar.gz' -o -name '*.tgz' -o -name '*.sql.gz' -o -name '*.dmp' -o -name '*.zip' -o -size +10M \\) -printf '%T@ %s %p\\n' 2>/dev/null | sort -rn | head -5; ` +
      `else echo ''; fi`,
  );

  const lines = stdout.trim().split("\n").filter(Boolean);
  const parsed = lines
    .map(parseFindLine)
    .filter((f): f is BackupFileInfo => f != null);

  return {
    path: basePath,
    latest: parsed[0] ?? null,
    fileCount: parsed.length,
  };
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export async function runBackupsCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const configuredPaths = getBackupPaths();
  const paths = await expandBackupPaths(configuredPaths);
  const maxAgeDays = getBackupMaxAgeDays();
  const minWarningBytes = getBackupMinSizeWarningBytes();
  const alerts: AlertInput[] = [];
  const pathResults: Record<string, unknown> = {};

  if (paths.length === 0) {
    return {
      module: "backups",
      status: "critical",
      data: { configuredPaths, paths: pathResults, summary: { present: false } },
      alerts: [
        {
          level: "critical",
          message: "No backup paths resolved from BACKUP_PATHS",
          recommendation: `Check BACKUP_PATHS (${configuredPaths.join(", ")})`,
        },
      ],
    };
  }

  const scans = await Promise.all(paths.map(scanBackupPath));
  const allLatest = scans.map((s) => s.latest).filter((f): f is BackupFileInfo => f != null);

  for (const scan of scans) {
    pathResults[scan.path] = {
      found: scan.fileCount > 0,
      fileCount: scan.fileCount,
      latest: scan.latest
        ? {
            file: scan.latest.path,
            ageHours: Math.round(scan.latest.ageHours * 10) / 10,
            ageDays: Math.round(scan.latest.ageDays * 100) / 100,
            sizeBytes: scan.latest.sizeBytes,
            sizeHuman: formatBytes(scan.latest.sizeBytes),
          }
        : null,
    };

    if (!scan.latest) {
      alerts.push({
        level: "warning",
        message: `No backup files in ${scan.path}`,
        recommendation: "Confirm path exists or add to BACKUP_PATHS",
      });
    }
  }

  let status: CheckResult["status"] = "healthy";

  if (allLatest.length === 0) {
    status = "critical";
    alerts.push({
      level: "critical",
      message: "No backups found in any configured path",
      recommendation: `Check BACKUP_PATHS (${paths.join(", ")}) and backup jobs`,
    });
    return {
      module: "backups",
      status,
      data: {
        configuredPaths,
        paths: pathResults,
        summary: { present: false },
      },
      alerts: alerts.filter((a) => a.level === "critical"),
    };
  }

  const substantial = allLatest.filter(
    (f) => f.sizeBytes >= minWarningBytes,
  );
  const candidates =
    substantial.length > 0
      ? substantial
      : allLatest.filter((f) => f.sizeBytes > 0);

  const best = candidates.reduce((a, b) =>
    a.mtimeSec >= b.mtimeSec ? a : b,
  );

  const summary = {
    present: true,
    latestFile: best.path,
    ageHours: Math.round(best.ageHours * 10) / 10,
    ageDays: Math.round(best.ageDays * 100) / 100,
    sizeBytes: best.sizeBytes,
    sizeHuman: formatBytes(best.sizeBytes),
    maxAgeDays,
  };

  if (best.sizeBytes === 0) {
    status = "critical";
    alerts.push({
      level: "critical",
      message: `Latest backup is empty (0 bytes): ${best.path}`,
    });
  } else if (best.ageDays > maxAgeDays) {
    status = "critical";
    alerts.push({
      level: "critical",
      message: `Newest backup is ${Math.round(best.ageDays)} days old (limit ${maxAgeDays}d): ${best.path}`,
    });
  } else if (best.sizeBytes < minWarningBytes) {
    status = "warning";
    alerts.push({
      level: "warning",
      message: `Latest backup unusually small (${formatBytes(best.sizeBytes)}): ${best.path}`,
      recommendation: "Verify backup job completed successfully",
    });
  }

  const hasGoodBackup = best.sizeBytes > 0 && best.ageDays <= maxAgeDays;
  const finalAlerts = alerts.filter(
    (a) =>
      !(
        hasGoodBackup &&
        a.level === "warning" &&
        a.message.startsWith("No backup files")
      ),
  );

  if (status === "healthy" && finalAlerts.some((a) => a.level === "warning")) {
    status = "warning";
  }

  return {
    module: "backups",
    status,
    data: { configuredPaths, paths: pathResults, summary },
    alerts: finalAlerts,
  };
}
