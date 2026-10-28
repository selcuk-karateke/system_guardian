import {
  getBackupMaxAgeDays,
  getBackupMinSizeWarningBytes,
  getBackupPaths,
} from "@/lib/config";
import {
  backupEmptyRecommendation,
  backupMissingRecommendation,
  backupSmallRecommendation,
  backupStaleRecommendation,
} from "@/lib/protect/playbooks";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

export type BackupFileInfo = {
  path: string;
  mtimeSec: number;
  sizeBytes: number;
  ageHours: number;
  ageDays: number;
  kind?: "file" | "daily_snapshot" | "monthly_archive";
};

function shellQuote(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

function isDailySnapshotRoot(path: string): boolean {
  const norm = path.replace(/\/$/, "");
  return norm.endsWith("/daily") || norm === "/backups/daily";
}

function isMonthlyArchiveRoot(path: string): boolean {
  const norm = path.replace(/\/$/, "");
  return norm.endsWith("/monthly") || norm === "/backups/monthly";
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
    kind: "file",
  };
}

function infoFromMtime(
  path: string,
  mtimeSec: number,
  sizeBytes: number,
  kind: BackupFileInfo["kind"],
): BackupFileInfo {
  const ageHours = (Date.now() / 1000 - mtimeSec) / 3600;
  return {
    path,
    mtimeSec,
    sizeBytes,
    ageHours,
    ageDays: ageHours / 24,
    kind,
  };
}

async function expandBackupPaths(
  serverId: string,
  patterns: string[],
): Promise<string[]> {
  const ssh = await getSshClient(serverId);
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

/** rsync daily folders — use directory mtime (file mtimes inside are preserved by rsync). */
async function scanDailySnapshotRoot(
  serverId: string,
  basePath: string,
): Promise<{ path: string; latest: BackupFileInfo | null; fileCount: number }> {
  const ssh = await getSshClient(serverId);
  const q = shellQuote(basePath);
  const { stdout: listOut } = await ssh.exec(
    `if [ ! -d ${q} ]; then echo ''; exit 0; fi; ` +
      `find ${q} -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\\n' 2>/dev/null | sort -rn`,
  );
  const lines = listOut.trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    return { path: basePath, latest: null, fileCount: 0 };
  }

  const top = lines[0].trim().split(/\s+/);
  const mtimeSec = parseFloat(top[0] ?? "");
  const dirPath = top.slice(1).join(" ");
  if (!Number.isFinite(mtimeSec) || !dirPath) {
    return { path: basePath, latest: null, fileCount: 0 };
  }

  const { stdout: duOut } = await ssh.exec(
    `du -sb ${shellQuote(dirPath)} 2>/dev/null | cut -f1`,
  );
  const sizeBytes = parseInt(duOut.trim(), 10) || 0;

  return {
    path: basePath,
    latest: infoFromMtime(dirPath, mtimeSec, sizeBytes, "daily_snapshot"),
    fileCount: lines.length,
  };
}

async function scanBackupPath(
  serverId: string,
  basePath: string,
): Promise<{ path: string; latest: BackupFileInfo | null; fileCount: number }> {
  if (isDailySnapshotRoot(basePath)) {
    return scanDailySnapshotRoot(serverId, basePath);
  }

  const ssh = await getSshClient(serverId);
  const q = shellQuote(basePath);
  const filePatterns =
    isMonthlyArchiveRoot(basePath)
      ? `-name '*.tar.gz' -o -name '*.tgz'`
      : `-name '*.tar.gz' -o -name '*.tgz' -o -name '*.sql.gz' -o -name '*.dmp' -o -name '*.zip' -o -size +10M`;

  const { stdout } = await ssh.exec(
    `if [ -f ${q} ]; then stat -c '%Y %s %n' ${q} 2>/dev/null; ` +
      `elif [ -d ${q} ]; then ` +
      `find ${q} -type f ! -name '.*' \\( ${filePatterns} \\) -printf '%T@ %s %p\\n' 2>/dev/null | sort -rn | head -5; ` +
      `else echo ''; fi`,
  );

  const lines = stdout.trim().split("\n").filter(Boolean);
  const parsed = lines
    .map(parseFindLine)
    .filter((f): f is BackupFileInfo => f != null)
    .map((f) => ({
      ...f,
      kind: isMonthlyArchiveRoot(basePath) ? "monthly_archive" as const : f.kind,
    }));

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
  const configuredPaths = getBackupPaths();
  const paths = await expandBackupPaths(serverId, configuredPaths);
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

  const scans = await Promise.all(
    paths.map((p) => scanBackupPath(serverId, p)),
  );
  const allLatest = scans.map((s) => s.latest).filter((f): f is BackupFileInfo => f != null);

  for (const scan of scans) {
    pathResults[scan.path] = {
      found: scan.fileCount > 0,
      fileCount: scan.fileCount,
      layout: isDailySnapshotRoot(scan.path)
        ? "daily_snapshot"
        : isMonthlyArchiveRoot(scan.path)
          ? "monthly_archive"
          : "files",
      latest: scan.latest
        ? {
            file: scan.latest.path,
            kind: scan.latest.kind,
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
      recommendation: backupMissingRecommendation(paths),
    });
    return {
      module: "backups",
      status,
      data: {
        configuredPaths,
        paths: pathResults,
        summary: { present: false },
        nasNote:
          "NAS-Kopie (/mnt/md0/… auf separatem Host) wird nicht per SSH geprüft — nur Hetzner-Pfade",
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
    latestKind: best.kind,
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
      recommendation: backupEmptyRecommendation(best.path),
    });
  } else if (best.ageDays > maxAgeDays) {
    status = "critical";
    const kindLabel =
      best.kind === "daily_snapshot" ? "Daily-Snapshot" : "Backup";
    alerts.push({
      level: "critical",
      message: `Newest ${kindLabel} is ${Math.round(best.ageDays)} days old (limit ${maxAgeDays}d): ${best.path}`,
      recommendation: backupStaleRecommendation(best.path, maxAgeDays),
    });
  } else if (best.sizeBytes < minWarningBytes) {
    status = "warning";
    alerts.push({
      level: "warning",
      message: `Latest backup unusually small (${formatBytes(best.sizeBytes)}): ${best.path}`,
      recommendation: backupSmallRecommendation(),
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
    data: {
      configuredPaths,
      paths: pathResults,
      summary,
      nasNote:
        "NAS unter /mnt/md0/backups/hetzner/ wird vom NAS geholt — Guardian prüft nur Cron-Ziel auf dem SSH-Host (/backups/…)",
    },
    alerts: finalAlerts,
  };
}
