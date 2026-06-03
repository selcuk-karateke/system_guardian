import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

export async function runRaidCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = getSshClient();
  const { stdout } = await ssh.exec("cat /proc/mdstat");
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const arrays: Record<string, string> = {};

  const blocks = stdout.split(/\n\n+/);
  for (const block of blocks) {
    const nameMatch = block.match(/^(md\d+)\s*:/m);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    arrays[name] = block.trim();

    if (/\[_+\]/.test(block) || block.includes("F,")) {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `RAID ${name} failed or missing disk`,
        recommendation: "Replace failed disk and rebuild array immediately",
      });
    } else if (block.includes("recovery") || block.includes("resync")) {
      if (status !== "critical") status = "warning";
      alerts.push({
        level: "warning",
        message: `RAID ${name} is rebuilding/resyncing`,
      });
    } else if (/\[\d+\/\d+\]\s+\[U_\]|\[._\]/.test(block)) {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `RAID ${name} is degraded`,
        recommendation: "Add replacement disk before another failure",
      });
    }
  }

  return {
    module: "raid",
    status,
    data: { mdstat: stdout, arrays },
    alerts,
  };
}
