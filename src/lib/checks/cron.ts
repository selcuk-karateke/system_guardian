import { diffHashMaps } from "@/lib/history/diff";
import { diffAndStore } from "@/lib/history/persist";
import { getSshClient } from "@/lib/ssh";
import {
  getCronJobOrigin,
  isSuspiciousCronContent,
  partitionCronJobs,
  summarizeSystemCronBuckets,
  shouldAlertCronDiff,
} from "./cron-patterns";
import type { AlertInput, CheckResult } from "./types";

export const COLLECT_CRON_SCRIPT = `
for period in daily weekly monthly hourly; do
  dir="/etc/cron.$period"
  [ -d "$dir" ] || continue
  for f in "$dir"/*; do
    [ -f "$f" ] || continue
    printf 'periodic\\t%s\\t%s\\n' "cron.$period" "$(basename "$f")"
  done
done
for f in /etc/cron.d/*; do
  [ -f "$f" ] || continue
  content=$(tr '\\n' ' ' < "$f" | head -c 800)
  printf 'file\\tcron.d\\t%s\\t%s\\n' "$(basename "$f")" "$content"
done
if [ -f /etc/crontab ]; then
  content=$(tr '\\n' ' ' < /etc/crontab | head -c 800)
  printf 'file\\tcrontab\\tmain\\t%s\\n' "$content"
fi
crontab -l 2>/dev/null | grep -v '^#' | grep -v '^[[:space:]]*$' | while IFS= read -r line; do
  printf 'crontab\\troot\\t%s\\n' "$line"
done
for userfile in /var/spool/cron/crontabs/*; do
  [ -f "$userfile" ] || continue
  user=$(basename "$userfile")
  grep -v '^#' "$userfile" | grep -v '^[[:space:]]*$' | while IFS= read -r line; do
    printf 'crontab\\t%s\\t%s\\n' "$user" "$line"
  done
done
`.trim();

export function parseCronCollectOutput(stdout: string): Record<string, string> {
  const jobs: Record<string, string> = {};

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    if (parts.length < 3) continue;

    const [kind, scope, nameOrLine, content] = parts;
    if (kind === "periodic") {
      jobs[`periodic:${scope}:${nameOrLine}`] = nameOrLine;
    } else if (kind === "file") {
      jobs[`file:${scope}:${nameOrLine}`] = content ?? "";
    } else if (kind === "crontab") {
      const idx = Object.keys(jobs).filter((k) => k.startsWith("crontab:")).length;
      jobs[`crontab:${scope}:${idx}`] = nameOrLine;
    }
  }

  return jobs;
}

export async function runCronCheck(serverId: string): Promise<CheckResult> {
  const ssh = await getSshClient(serverId);
  const { stdout } = await ssh.exec(COLLECT_CRON_SCRIPT);
  const jobs = parseCronCollectOutput(stdout);
  const { systemJobs, humanJobs, systemCount, humanCount } =
    partitionCronJobs(jobs);
  const systemBuckets = summarizeSystemCronBuckets(systemJobs);

  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const { diffs, isBaseline } = await diffAndStore(
    serverId,
    "cron",
    { jobs },
    (prev, curr) =>
      diffHashMaps(
        (prev?.jobs as Record<string, string>) ?? {},
        curr.jobs as Record<string, string>,
      ),
  );

  if (isBaseline) {
    alerts.push({
      level: "info",
      message: `Cron baseline: ${systemCount} system, ${humanCount} human`,
    });
  }

  for (const [key, value] of Object.entries(jobs)) {
    if (!isSuspiciousCronContent(value)) continue;
    status = "warning";
    const origin = getCronJobOrigin(key);
    alerts.push({
      level: "warning",
      message: `Suspicious ${origin} cron: ${value.slice(0, 120)}`,
      recommendation:
        origin === "human"
          ? "Review user crontabs (crontab -l, /var/spool/cron/crontabs)"
          : "Review /etc/cron.* and package drop-ins",
    });
  }

  for (const d of diffs) {
    if (!shouldAlertCronDiff(d, jobs)) continue;
    status = "warning";
    const label = jobs[d.entityKey] ?? d.newValue ?? d.entityKey;
    const origin = getCronJobOrigin(d.entityKey);
    alerts.push({
      level: "warning",
      message: `${origin === "human" ? "Human" : "System"} cron ${d.changeType}: ${label}`,
      recommendation:
        origin === "human"
          ? "Verify who added this user crontab entry"
          : "Review system cron paths for unexpected package or admin changes",
    });
  }

  return {
    module: "cron",
    status,
    data: {
      jobCount: Object.keys(jobs).length,
      systemCount,
      humanCount,
      systemBuckets,
      jobs,
      systemJobs,
      humanJobs,
    },
    alerts,
  };
}
