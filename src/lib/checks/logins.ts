import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

export async function runLoginsCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = getSshClient();
  const [last, auth] = await Promise.all([
    ssh.exec("last -n 30 2>/dev/null"),
    ssh.exec(
      "grep -E 'Failed password|Accepted password|Accepted publickey' /var/log/auth.log 2>/dev/null | tail -50",
    ),
  ]);

  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const logins: string[] = [];
  const failedIps = new Set<string>();
  const rootIps = new Set<string>();

  for (const line of last.stdout.split("\n")) {
    if (line.trim()) logins.push(line.trim());
    if (line.startsWith("root ")) {
      const ipMatch = line.match(/\d+\.\d+\.\d+\.\d+/);
      if (ipMatch) rootIps.add(ipMatch[0]);
    }
  }

  for (const line of auth.stdout.split("\n")) {
    if (line.includes("Failed password")) {
      const ipMatch = line.match(/from\s+(\S+)/);
      if (ipMatch) failedIps.add(ipMatch[1]);
    }
  }

  if (rootIps.size > 0) {
    alerts.push({
      level: "warning",
      message: `Root login detected from: ${[...rootIps].join(", ")}`,
      recommendation: "Confirm root SSH access is expected",
    });
    status = "warning";
  }

  if (failedIps.size >= 3) {
    alerts.push({
      level: "warning",
      message: `Multiple failed SSH attempts from ${failedIps.size} sources`,
    });
    status = "warning";
  }

  return {
    module: "logins",
    status,
    data: { recentLogins: logins.slice(0, 15), failedCount: failedIps.size },
    alerts,
  };
}
