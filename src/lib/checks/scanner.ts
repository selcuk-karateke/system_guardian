import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

const SCANNER_TOOLS = ["nmap", "masscan", "zmap", "rustscan"];

export async function runScannerCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = getSshClient();
  const { stdout: whichOut } = await ssh.exec(
    `which ${SCANNER_TOOLS.join(" ")} 2>/dev/null`,
  );
  const { stdout: dpkgOut } = await ssh.exec(
    `dpkg -l 2>/dev/null | grep -E '${SCANNER_TOOLS.join("|")}' || rpm -qa 2>/dev/null | grep -E '${SCANNER_TOOLS.join("|")}' || true`,
  );

  const found: string[] = [];
  for (const tool of SCANNER_TOOLS) {
    if (whichOut.includes(tool) || dpkgOut.toLowerCase().includes(tool)) {
      found.push(tool);
    }
  }

  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  if (found.length > 0) {
    status = "warning";
    alerts.push({
      level: "warning",
      message: `Scanner tools installed: ${found.join(", ")}`,
      recommendation: "Remove if not needed; check auth.log for scan activity",
    });
  }

  const { stdout: authScan } = await ssh.exec(
    "grep -iE 'nmap|masscan|zmap' /var/log/auth.log 2>/dev/null | tail -5",
  );
  if (authScan.trim()) {
    status = "critical";
    alerts.push({
      level: "critical",
      message: "Scanner tool execution detected in logs",
    });
  }

  return {
    module: "scanner",
    status,
    data: { installed: found },
    alerts,
  };
}
