import { getSshClient } from "@/lib/ssh";
import { classifyLogLines } from "./log-patterns";
import type { AlertInput, CheckResult } from "./types";

const MAX_STORED_LINES = 20;
const MAX_ALERT_LINE = 240;

function truncateLine(line: string, max = MAX_ALERT_LINE): string {
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

export async function runLogsCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = getSshClient();
  const [journal, dmesg] = await Promise.all([
    ssh.exec("journalctl -p err -n 80 --no-pager 2>/dev/null || echo ''"),
    ssh.exec("dmesg 2>/dev/null | tail -80 || echo ''"),
  ]);

  const lines = (journal.stdout + "\n" + dmesg.stdout)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const { critical, warning } = classifyLogLines(lines);
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  for (const line of critical.slice(0, 5)) {
    status = "critical";
    alerts.push({
      level: "critical",
      message: truncateLine(line),
      recommendation: "Inspect journalctl -p err and dmesg immediately",
    });
  }

  if (status !== "critical") {
    for (const line of warning.slice(0, 5)) {
      status = "warning";
      alerts.push({
        level: "warning",
        message: truncateLine(line),
        recommendation: "Review auth.log / journal if pattern persists",
      });
    }
  }

  return {
    module: "logs",
    status,
    data: {
      linesScanned: lines.length,
      criticalLines: critical.slice(0, MAX_STORED_LINES),
      warningLines: warning.slice(0, MAX_STORED_LINES),
    },
    alerts,
  };
}
