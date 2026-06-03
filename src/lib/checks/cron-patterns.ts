/** Normale Debian-/Ubuntu-Cron-Skripte in cron.{daily,weekly,monthly} — nie als Warnung. */
export const DEBIAN_CRON_WHITELIST = new Set([
  ".placeholder",
  "apt",
  "apt-compat",
  "aptitude",
  "bsdmainutils",
  "chkrootkit",
  "default",
  "dpkg",
  "logrotate",
  "man-db",
  "standard",
  "sysstat",
]);

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

  if (diff.entityKey.startsWith("periodic:")) {
    const basename = diff.entityKey.split(":").pop() ?? "";
    if (isDebianCronWhitelisted(basename)) return false;
    return diff.changeType === "added" || diff.changeType === "changed";
  }

  if (isSuspiciousCronContent(value)) return true;

  return false;
}
