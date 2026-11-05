import { db } from "@/db";
import { metricsSnapshots } from "@/db/schema";
import { THRESHOLDS, worstStatus } from "@/lib/config";
import { getSshClient } from "@/lib/ssh";
import { sampleHostEgress } from "./egress-traffic";
import type { AlertInput, CheckResult } from "./types";

function parseMemPercent(freeOut: string): { ram: number; swap: number } {
  const lines = freeOut.trim().split("\n");
  const mem = lines.find((l) => l.startsWith("Mem:"));
  const swap = lines.find((l) => l.startsWith("Swap:"));
  let ram = 0;
  let swapPct = 0;
  if (mem) {
    const parts = mem.split(/\s+/).filter(Boolean);
    const total = parseInt(parts[1], 10);
    const used = parseInt(parts[2], 10);
    if (total) ram = Math.round((used / total) * 100);
  }
  if (swap) {
    const parts = swap.split(/\s+/).filter(Boolean);
    const total = parseInt(parts[1], 10);
    const used = parseInt(parts[2], 10);
    if (total) swapPct = Math.round((used / total) * 100);
  }
  return { ram, swap: swapPct };
}

export type DfMount = {
  filesystem: string;
  usePercent: number;
  mountedOn: string;
};

/** Parse `df -hP` rows (portable columns: FS Size Used Avail Use% Mounted). */
export function parseDfMounts(dfOut: string): DfMount[] {
  const rows: DfMount[] = [];
  for (const line of dfOut.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const use = parts[4]?.match(/^(\d+)%$/);
    if (!use) continue;
    rows.push({
      filesystem: parts[0],
      usePercent: parseInt(use[1], 10),
      mountedOn: parts.slice(5).join(" "),
    });
  }
  return rows;
}

function isRealBlockFs(filesystem: string): boolean {
  return (
    filesystem.startsWith("/dev/") ||
    filesystem.startsWith("/dev/mapper/") ||
    // LVM / md without leading path edge cases already covered by /dev/
    filesystem.startsWith("UUID=")
  );
}

function isVirtualFs(filesystem: string): boolean {
  return /^(tmpfs|devtmpfs|overlay|squashfs|efivarfs|udev)$/i.test(filesystem);
}

/** Max use% on real disks only — ignore tmpfs/overlay (often 100% while / is fine). */
export function parseDiskMax(dfOut: string): {
  percent: number;
  mount: string | null;
} {
  let max = 0;
  let mount: string | null = null;
  for (const row of parseDfMounts(dfOut)) {
    if (isVirtualFs(row.filesystem) || !isRealBlockFs(row.filesystem)) continue;
    if (row.usePercent >= max) {
      max = row.usePercent;
      mount = row.mountedOn;
    }
  }
  return { percent: max, mount };
}

const WATCHED_TMPFS = new Set(["/tmp", "/var/tmp", "/dev/shm"]);

/** Watched tmpfs mounts at/over threshold (e.g. /tmp full) — not the disk metric. */
export function parseTmpfsAlerts(
  dfOut: string,
  warnAt = 90,
): { mount: string; percent: number }[] {
  return parseDfMounts(dfOut)
    .filter(
      (r) =>
        /^tmpfs$/i.test(r.filesystem) &&
        WATCHED_TMPFS.has(r.mountedOn) &&
        r.usePercent >= warnAt,
    )
    .map((r) => ({ mount: r.mountedOn, percent: r.usePercent }));
}

function parseUptimeSeconds(uptimeOut: string): number {
  const m = uptimeOut.match(/up\s+(?:(\d+)\s+days?,?\s*)?(\d+):(\d+)/);
  if (!m) return 0;
  const days = parseInt(m[1] ?? "0", 10);
  const hours = parseInt(m[2], 10);
  const mins = parseInt(m[3], 10);
  return days * 86400 + hours * 3600 + mins * 60;
}

export async function runServerHealthCheck(
  serverId: string,
): Promise<CheckResult> {
  const ssh = await getSshClient(serverId);
  const alerts: AlertInput[] = [];

  const [uptime, loadavg, free, df, sensors, nprocOut, egress] =
    await Promise.all([
      ssh.exec("uptime"),
      ssh.exec("cat /proc/loadavg"),
      ssh.exec("free -b"),
      ssh.exec("df -hP"),
      ssh.exec("sensors 2>/dev/null || echo ''"),
      ssh.exec("nproc"),
      sampleHostEgress(serverId, ssh).catch(() => null),
    ]);

  if (egress?.alerts.length) alerts.push(...egress.alerts);

  const loadParts = loadavg.stdout.trim().split(/\s+/);
  const cpuCores = Math.max(1, parseInt(nprocOut.stdout.trim(), 10) || 1);
  const load1 = parseFloat(loadParts[0] ?? "0");
  const effectiveLoadPercent = Math.min(
    100,
    Math.round((load1 / cpuCores) * 100),
  );
  const { ram, swap } = parseMemPercent(free.stdout);
  const { percent: disk, mount: diskMount } = parseDiskMax(df.stdout);
  const tmpfsHot = parseTmpfsAlerts(df.stdout);
  const uptimeSec = parseUptimeSeconds(uptime.stdout);

  let temp: number | undefined;
  const tempMatch = sensors.stdout.match(/\+(\d+\.?\d*)/);
  if (tempMatch) temp = Math.round(parseFloat(tempMatch[1]));

  if (effectiveLoadPercent >= THRESHOLDS.cpuCritical()) {
    alerts.push({
      level: "critical",
      message: `Load critical (${load1.toFixed(2)} / ${cpuCores} cores, ${effectiveLoadPercent}% effective)`,
      recommendation: "Identify top processes with top/htop",
    });
  } else if (effectiveLoadPercent >= THRESHOLDS.cpuWarning()) {
    alerts.push({
      level: "warning",
      message: `Load elevated (${load1.toFixed(2)} / ${cpuCores} cores, ${effectiveLoadPercent}% effective)`,
    });
  }

  if (ram >= THRESHOLDS.ramCritical()) {
    alerts.push({
      level: "critical",
      message: `RAM usage ${ram}%`,
      recommendation: "Check memory leaks or add RAM",
    });
  } else if (ram >= THRESHOLDS.ramWarning()) {
    alerts.push({ level: "warning", message: `RAM usage ${ram}%` });
  }

  if (disk >= THRESHOLDS.diskCritical()) {
    alerts.push({
      level: "critical",
      message: `Disk usage ${disk}%${diskMount ? ` on ${diskMount}` : ""}`,
      recommendation: "Clean logs, old backups, or expand volume",
    });
  } else if (disk >= THRESHOLDS.diskWarning()) {
    alerts.push({
      level: "warning",
      message: `Disk usage ${disk}%${diskMount ? ` on ${diskMount}` : ""}`,
    });
  }

  for (const t of tmpfsHot) {
    alerts.push({
      level: t.percent >= 95 ? "critical" : "warning",
      message: `tmpfs ${t.percent}% on ${t.mount}`,
      recommendation:
        t.mount === "/tmp" || t.mount === "/var/tmp"
          ? `Clear old files under ${t.mount} (builds, apt, docker temp)`
          : `Inspect ${t.mount} usage`,
    });
  }

  if (swap > 50) {
    alerts.push({
      level: "warning",
      message: `Swap usage ${swap}%`,
    });
  }

  const statuses = alerts.map((a) =>
    a.level === "critical" ? "critical" : a.level === "warning" ? "warning" : "healthy",
  ) as ("healthy" | "warning" | "critical")[];
  const status =
    statuses.length > 0
      ? worstStatus(statuses)
      : "healthy";

  await db.insert(metricsSnapshots).values({
    serverId,
    cpuPercent: effectiveLoadPercent,
    ramPercent: ram,
    swapPercent: swap,
    loadAvg1: loadParts[0],
    loadAvg5: loadParts[1],
    loadAvg15: loadParts[2],
    cpuCores,
    diskPercent: disk,
    uptimeSeconds: uptimeSec,
    temperatureCelsius: temp ?? null,
    networkOk: true,
  });

  return {
    module: "server_health",
    status: alerts.some((a) => a.level === "critical")
      ? "critical"
      : alerts.some((a) => a.level === "warning")
        ? "warning"
        : "healthy",
    data: {
      cpuPercent: effectiveLoadPercent,
      effectiveLoadPercent,
      cpuCores,
      ramPercent: ram,
      swapPercent: swap,
      diskPercent: disk,
      loadAvg: loadParts.slice(0, 3),
      uptimeSeconds: uptimeSec,
      temperatureCelsius: temp,
      networkOk: true,
      egressTxMbps: egress?.delta?.txMbps,
      egressTxBytes: egress?.delta?.txBytes,
      egressWindowSec: egress?.delta?.seconds,
      egressIface: egress?.delta?.topTxIface,
    },
    alerts,
  };
}
