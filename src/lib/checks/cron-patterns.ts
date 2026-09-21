/** Normale Debian-/Ubuntu-Cron-Skripte in cron.{daily,weekly,monthly} — nie als Warnung. */
export const DEBIAN_CRON_WHITELIST = new Set([
  ".placeholder",
  "apache2",
  "apt",
  "apt-compat",
  "aptitude",
  "bsdmainutils",
  "chkrootkit",
  "default",
  "dpkg",
  "e2scrub_all",
  "exim4-base",
  "fstrim",
  "locate",
  "logrotate",
  "man-db",
  "mdadm",
  "mlocate",
  "passwd",
  "popularity-contest",
  "rkhunter",
  "rsync",
  "standard",
  "sysstat",
  "tmpreaper",
  "unattended-upgrades",
]);

/** Bekannte /etc/cron.d Drop-ins (Paket-Wartung). */
export const DEBIAN_CRON_D_WHITELIST = new Set([
  "e2scrub_all",
  "anacron",
  "php",
  "sysstat",
  ".placeholder",
]);

export type CronOrigin = "system" | "human";

/** System = periodic + /etc/cron.d + /etc/crontab; Human = crontab -l + /var/spool/cron/crontabs */
export function getCronJobOrigin(key: string): CronOrigin {
  return key.startsWith("crontab:") ? "human" : "system";
}

export function partitionCronJobs(jobs: Record<string, string>): {
  systemJobs: Record<string, string>;
  humanJobs: Record<string, string>;
  systemCount: number;
  humanCount: number;
} {
  const systemJobs: Record<string, string> = {};
  const humanJobs: Record<string, string> = {};
  for (const [key, value] of Object.entries(jobs)) {
    if (getCronJobOrigin(key) === "human") humanJobs[key] = value;
    else systemJobs[key] = value;
  }
  return {
    systemJobs,
    humanJobs,
    systemCount: Object.keys(systemJobs).length,
    humanCount: Object.keys(humanJobs).length,
  };
}

/** Aufschlüsselung System-Cron (daily/weekly/monthly/cron.d/crontab). */
export function summarizeSystemCronBuckets(
  systemJobs: Record<string, string>,
): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (const key of Object.keys(systemJobs)) {
    if (key.startsWith("periodic:")) {
      const period = key.split(":")[1] ?? "periodic";
      buckets[period] = (buckets[period] ?? 0) + 1;
    } else if (key.startsWith("file:cron.d:")) {
      buckets["cron.d"] = (buckets["cron.d"] ?? 0) + 1;
    } else if (key.startsWith("file:crontab:")) {
      buckets["/etc/crontab"] = (buckets["/etc/crontab"] ?? 0) + 1;
    }
  }
  return buckets;
}

export const CRON_SUSPICIOUS_PATTERNS: RegExp[] = [
  /curl\s[^\n|]*\|\s*(ba)?sh/i,
  /\bwget\s/i,
  /\bnc\s/i,
  /\bbash\s+-c/i,
  /\bpython3?\s/i,
];

export function isDebianCronWhitelisted(basename: string): boolean {
  return DEBIAN_CRON_WHITELIST.has(basename);
}

export function isSuspiciousCronContent(content: string): boolean {
  return CRON_SUSPICIOUS_PATTERNS.some((p) => p.test(content));
}

export function shouldAlertCronDiff(
  diff: { changeType: string; entityKey: string; newValue?: string; previousValue?: string },
  jobs: Record<string, string>,
): boolean {
  const value =
    diff.newValue ?? jobs[diff.entityKey] ?? diff.previousValue ?? "";

  if (getCronJobOrigin(diff.entityKey) === "human") {
    if (isSuspiciousCronContent(value)) return true;
    return diff.changeType === "added" || diff.changeType === "changed";
  }

  if (diff.entityKey.startsWith("periodic:")) {
    const basename = diff.entityKey.split(":").pop() ?? "";
    if (isDebianCronWhitelisted(basename)) return false;
    return diff.changeType === "added" || diff.changeType === "changed";
  }

  if (diff.entityKey.startsWith("file:cron.d:")) {
    const basename = diff.entityKey.split(":").pop() ?? "";
    if (DEBIAN_CRON_D_WHITELIST.has(basename)) return false;
    if (isSuspiciousCronContent(value)) return true;
    return diff.changeType === "added" || diff.changeType === "changed";
  }

  if (diff.entityKey.startsWith("file:crontab:")) {
    return isSuspiciousCronContent(value);
  }

  if (isSuspiciousCronContent(value)) return true;

  return false;
}
