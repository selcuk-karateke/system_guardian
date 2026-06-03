import { diffHashMaps } from "@/lib/history/diff";
import { diffAndStore } from "@/lib/history/persist";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

export async function runCronCheck(serverId: string): Promise<CheckResult> {
  const ssh = getSshClient();
  const { stdout } = await ssh.exec(
    "ls -la /etc/cron.d /etc/cron.daily 2>/dev/null; crontab -l 2>/dev/null; for u in $(cut -f1 -d: /etc/passwd); do crontab -u \"$u\" -l 2>/dev/null && echo \"# user:$u\"; done",
  );

  const jobs: Record<string, string> = {};
  let idx = 0;
  for (const line of stdout.split("\n").filter((l) => l.trim())) {
    if (!line.startsWith("#") && !line.startsWith("total")) {
      jobs[`job_${idx++}`] = line.trim();
    }
  }

  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const diffs = await diffAndStore(
    serverId,
    "cron",
    { jobs },
    (prev, curr) =>
      diffHashMaps(
        (prev?.jobs as Record<string, string>) ?? {},
        curr.jobs as Record<string, string>,
      ),
  );

  for (const d of diffs) {
    status = "warning";
    alerts.push({
      level: "warning",
      message: `Cron job ${d.changeType}: ${d.entityKey}`,
      recommendation: "Review /etc/cron.d and user crontabs",
    });
  }

  return {
    module: "cron",
    status,
    data: { jobCount: Object.keys(jobs).length },
    alerts,
  };
}
