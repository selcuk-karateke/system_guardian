import { db } from "@/db";
import { metricsSnapshots } from "@/db/schema";
import { THRESHOLDS } from "@/lib/config";
import { getSshClient } from "@/lib/ssh";
import {
  DISK_TEMP_CMD,
  DISK_TEMP_CRIT_C,
  DISK_TEMP_WARN_C,
  listBlockFilesystems,
  parseDiskMax,
  parseDiskTemps,
  parseTmpfsAlerts,
} from "./disk-storage";
import { sampleHostEgress } from "./egress-traffic";
import {
  HOST_INVENTORY_CMD,
  parseHostInventory,
} from "./host-inventory";
import {
  HOST_NETWORK_CMD,
  parseHostInterfaces,
} from "./host-network";
import type { AlertInput, CheckResult } from "./types";

export type { DfMount, DiskTemp } from "./disk-storage";
export {
  listBlockFilesystems,
  parseDfMounts,
  parseDiskMax,
  parseDiskTemps,
  parseTmpfsAlerts,
} from "./disk-storage";

function parseMemPercent(freeOut: string): { ram: number; swap: number } {
  const lines = freeOut.trim().split("\n");
  const mem = lines.find((l) => l.startsWith("Mem:"));
  const swap = lines.find((l) => l.startsWith("Swap:"));
  let ram = 0;
  let swapPct = 0;
  if (mem) {
    const parts = mem.split(/\s+/).filter(Boolean);
    const total = parseInt(parts[1]!, 10);
    const used = parseInt(parts[2]!, 10);
    if (total) ram = Math.round((used / total) * 100);
  }
  if (swap) {
    const parts = swap.split(/\s+/).filter(Boolean);
    const total = parseInt(parts[1]!, 10);
    const used = parseInt(parts[2]!, 10);
    if (total) swapPct = Math.round((used / total) * 100);
  }
  return { ram, swap: swapPct };
}

function parseUptimeSeconds(uptimeOut: string): number {
  const m = uptimeOut.match(/up\s+(?:(\d+)\s+days?,?\s*)?(\d+):(\d+)/);
  if (!m) return 0;
  const days = parseInt(m[1] ?? "0", 10);
  const hours = parseInt(m[2]!, 10);
  const mins = parseInt(m[3]!, 10);
  return days * 86400 + hours * 3600 + mins * 60;
}

export async function runServerHealthCheck(
  serverId: string,
): Promise<CheckResult> {
  const ssh = await getSshClient(serverId);
  const alerts: AlertInput[] = [];

  const [
    uptime,
    loadavg,
    free,
    df,
    sensors,
    nprocOut,
    inventoryOut,
    diskTempOut,
    netIfacesOut,
    egress,
  ] = await Promise.all([
    ssh.exec("uptime"),
    ssh.exec("cat /proc/loadavg"),
    ssh.exec("free -b"),
    ssh.exec("df -hP"),
    ssh.exec("sensors 2>/dev/null || echo ''"),
    ssh.exec("nproc"),
    ssh.exec(HOST_INVENTORY_CMD),
    ssh.exec(DISK_TEMP_CMD),
    ssh.exec(HOST_NETWORK_CMD),
    sampleHostEgress(serverId, ssh).catch(() => null),
  ]);

  if (egress?.alerts.length) alerts.push(...egress.alerts);

  const inventory = parseHostInventory(inventoryOut.stdout);
  const filesystems = listBlockFilesystems(df.stdout);
  const diskTemps = parseDiskTemps(diskTempOut.stdout);
  const interfaces = parseHostInterfaces(netIfacesOut.stdout);

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
  if (tempMatch) temp = Math.round(parseFloat(tempMatch[1]!));

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

  for (const d of diskTemps) {
    if (d.celsius == null) continue;
    if (d.celsius >= DISK_TEMP_CRIT_C) {
      alerts.push({
        level: "critical",
        message: `Festplatte ${d.path} ${d.celsius}°C`,
        recommendation: "Check cooling / airflow; replace failing drive if SMART warns",
      });
    } else if (d.celsius >= DISK_TEMP_WARN_C) {
      alerts.push({
        level: "warning",
        message: `Festplatte ${d.path} ${d.celsius}°C`,
      });
    }
  }

  if (inventory.rebootRequired) {
    alerts.push({
      level: "warning",
      message: "Systemneustart erforderlich (reboot-required)",
      recommendation: "Schedule a reboot in the next maintenance window",
    });
  }
  if (inventory.securityUpdates > 0) {
    alerts.push({
      level: "warning",
      message: `${inventory.securityUpdates} security update(s) available (${inventory.updatesAvailable} total)`,
      recommendation: "Apply security updates, then reboot if required",
    });
  } else if (inventory.updatesAvailable > 0) {
    alerts.push({
      level: "info",
      message: `${inventory.updatesAvailable} package update(s) available`,
    });
  }

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
      hostname: inventory.hostname,
      osPretty: inventory.osPretty,
      kernel: inventory.kernel,
      cpuModel: inventory.cpuModel,
      systemTime: inventory.systemTime,
      rebootRequired: inventory.rebootRequired,
      updatesAvailable: inventory.updatesAvailable,
      securityUpdates: inventory.securityUpdates,
      filesystems,
      diskTemps,
      interfaces,
    },
    alerts,
  };
}
