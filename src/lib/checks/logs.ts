import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

const PATTERNS = [
  { re: /OOM|out of memory/i, level: "critical" as const, label: "OOM" },
  { re: /PANIC|FATAL/i, level: "critical" as const, label: "PANIC/FATAL" },
  { re: /ERROR/i, level: "warning" as const, label: "ERROR" },
  { re: /disk error|I\/O error/i, level: "critical" as const, label: "Disk Error" },
];

export async function runLogsCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = getSshClient();
  const [journal, dmesg] = await Promise.all([
    ssh.exec("journalctl -p err -n 50 --no-pager 2>/dev/null || echo ''"),
    ssh.exec("dmesg 2>/dev/null | tail -50 || echo ''"),
  ]);

  const combined = journal.stdout + "\n" + dmesg.stdout;
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const matches: string[] = [];

  for (const { re, level, label } of PATTERNS) {
    if (re.test(combined)) {
      matches.push(label);
      if (level === "critical") status = "critical";
      else if (status !== "critical") status = "warning";
      alerts.push({
        level,
        message: `Log pattern detected: ${label}`,
        recommendation: "Review journalctl and docker logs for root cause",
      });
    }
  }

  return {
    module: "logs",
    status,
    data: { matches, sampleLines: combined.split("\n").slice(0, 10) },
    alerts,
  };
}
