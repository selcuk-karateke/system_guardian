import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

export function isRaidCheckEnabled(): boolean {
  return process.env.RAID_CHECK_ENABLED !== "false";
}

export async function runRaidCheck(serverId: string): Promise<CheckResult> {
  void serverId;

  if (!isRaidCheckEnabled()) {
    return {
      module: "raid",
      status: "healthy",
      data: { skipped: true, reason: "RAID_CHECK_ENABLED=false" },
      alerts: [],
    };
  }

  const ssh = getSshClient();
  const { stdout } = await ssh.exec("cat /proc/mdstat 2>/dev/null || echo ''");
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const arrays: Record<string, string> = {};

  const hasMdArray = /md\d+\s*:/m.test(stdout);
  if (!hasMdArray) {
    return {
      module: "raid",
      status: "healthy",
      data: {
        mdstat: stdout.trim(),
        configured: false,
        summary:
          "Kein Software-RAID (mdadm) auf diesem Host – nur Hetzner-Hardware-RAID oder einzelne Festplatten.",
      },
      alerts: [],
    };
  }

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
