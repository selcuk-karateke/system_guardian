import { THRESHOLDS } from "@/lib/config";
import { getSshClient } from "@/lib/ssh";
import {
  isSuspiciousProcessLine,
  parsePsAuxLines,
} from "./process-patterns";
import type { AlertInput, CheckResult } from "./types";

function parseCpuPercent(line: string): number | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const cpu = parseFloat(parts[2]);
  return Number.isFinite(cpu) ? cpu : null;
}

export async function runProcessesCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = await getSshClient(serverId);
  const { stdout } = await ssh.exec(
    "ps auxww 2>/dev/null | head -250 || ps aux 2>/dev/null | head -250",
  );
  const lines = parsePsAuxLines(stdout);
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const suspicious: string[] = [];
  const highCpu: string[] = [];

  const cpuThreshold = THRESHOLDS.processCpuWarning();

  for (const line of lines) {
    if (isSuspiciousProcessLine(line)) {
      suspicious.push(line.slice(0, 280));
      status = "critical";
      alerts.push({
        level: "critical",
        message: `Suspicious process: ${line.slice(0, 200)}`,
        recommendation: "Verify with ps auxf / kill if unauthorized; check /tmp and cron",
      });
      if (suspicious.length >= 8) break;
    }

    const cpu = parseCpuPercent(line);
    if (cpu != null && cpu >= cpuThreshold) {
      const cmd = line.split(/\s+/).slice(10).join(" ") || line;
      if (
        !/^\[?(kthreadd|ksoftirqd|migration|rcu_|docker|containerd)/i.test(cmd) &&
        !isSuspiciousProcessLine(line)
      ) {
        highCpu.push(`${cpu.toFixed(0)}% ${cmd.slice(0, 120)}`);
      }
    }
  }

  if (status !== "critical" && highCpu.length > 0) {
    status = "warning";
    for (const msg of highCpu.slice(0, 3)) {
      alerts.push({
        level: "warning",
        message: `High CPU process: ${msg}`,
        recommendation: "Inspect with top/htop; rule out miner or runaway job",
      });
    }
  }

  return {
    module: "processes",
    status,
    data: {
      processCount: lines.length,
      suspiciousCount: suspicious.length,
      suspicious: suspicious.slice(0, 10),
      highCpu: highCpu.slice(0, 5),
    },
    alerts,
  };
}
