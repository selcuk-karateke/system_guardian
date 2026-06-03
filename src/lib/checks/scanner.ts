import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

const SCANNER_TOOLS = ["nmap", "masscan", "zmap", "rustscan"] as const;

export async function runScannerCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = getSshClient();
  const found: { tool: string; path: string }[] = [];

  await Promise.all(
    SCANNER_TOOLS.map(async (tool) => {
      const { stdout, code } = await ssh.exec(`which ${tool} 2>/dev/null`);
      const path = stdout.trim().split("\n")[0]?.trim();
      if (code === 0 && path) {
        found.push({ tool, path });
      }
    }),
  );

  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  if (found.length > 0) {
    status = "warning";
    alerts.push({
      level: "warning",
      message: `Scanner tools installed: ${found.map((f) => `${f.tool} (${f.path})`).join(", ")}`,
      recommendation: "Remove if not needed; verify they were intentionally installed",
    });
  }

  return {
    module: "scanner",
    status,
    data: {
      installed: found.map((f) => f.tool),
      binaries: Object.fromEntries(found.map((f) => [f.tool, f.path])),
    },
    alerts,
  };
}
