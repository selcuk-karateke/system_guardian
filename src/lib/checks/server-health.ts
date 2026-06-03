import { db } from "@/db";
import { metricsSnapshots } from "@/db/schema";
import { THRESHOLDS, worstStatus } from "@/lib/config";
import { getSshClient } from "@/lib/ssh";
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

function parseDiskMax(dfOut: string): number {
  let max = 0;
  for (const line of dfOut.split("\n").slice(1)) {
    const m = line.match(/(\d+)%/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
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
  const ssh = getSshClient();
  const alerts: AlertInput[] = [];

  const [uptime, loadavg, free, df, sensors, nprocOut] = await Promise.all([
    ssh.exec("uptime"),
    ssh.exec("cat /proc/loadavg"),
    ssh.exec("free -b"),
    ssh.exec("df -h"),
    ssh.exec("sensors 2>/dev/null || echo ''"),
    ssh.exec("nproc"),
  ]);

  const loadParts = loadavg.stdout.trim().split(/\s+/);
  const cpuCores = Math.max(1, parseInt(nprocOut.stdout.trim(), 10) || 1);
  const load1 = parseFloat(loadParts[0] ?? "0");
  const effectiveLoadPercent = Math.min(
    100,
    Math.round((load1 / cpuCores) * 100),
  );
  const { ram, swap } = parseMemPercent(free.stdout);
  const disk = parseDiskMax(df.stdout);
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
      message: `Disk usage ${disk}%`,
      recommendation: "Clean logs, old backups, or expand volume",
    });
  } else if (disk >= THRESHOLDS.diskWarning()) {
    alerts.push({ level: "warning", message: `Disk usage ${disk}%` });
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
    },
    alerts,
  };
}
