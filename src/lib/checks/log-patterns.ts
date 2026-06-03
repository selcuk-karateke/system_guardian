/** Lines matching these are ignored (KVM noise, scanners, normal network churn). */
export const LOG_IGNORE_PATTERNS: RegExp[] = [
  /EDID firmware/i,
  /no codecs found/i,
  /Protocol major versions differ/i,
  /Connection reset by peer/i,
  /snd_hda_intel/i,
  /\bPANIC\b/i,
  /\bFATAL\b/i,
];

/** CRITICAL – konkrete Muster, keine generischen Log-Level-Wörter. */
export const LOG_CRITICAL_PATTERNS: RegExp[] = [
  /kernel panic|Kernel panic/i,
  /Out of memory|oom[-_]kill|Killed process.*oom/i,
  /I\/O error|disk error|EXT4-fs error|XFS.*error|filesystem error|read-only file system/i,
  /mdadm.*degraded|\[[U_]\]|raid.*degraded/i,
  /Cannot connect to the Docker daemon|dockerd.*failed|docker daemon/i,
  /mysql.*corrupt|InnoDB.*corrupt|corruption/i,
];

/** WARNING – review, often transient */
export const LOG_WARNING_PATTERNS: RegExp[] = [
  /Failed password|Invalid user|authentication failure/i,
  /sshd\[.*error/i,
];

export function isIgnoredLogLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith("-- ")) return true;
  return LOG_IGNORE_PATTERNS.some((re) => re.test(t));
}

export function classifyLogLines(lines: string[]): {
  critical: string[];
  warning: string[];
} {
  const critical: string[] = [];
  const warning: string[] = [];
  const seenCrit = new Set<string>();
  const seenWarn = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (isIgnoredLogLine(trimmed)) continue;

    let matchedCrit = false;
    for (const re of LOG_CRITICAL_PATTERNS) {
      if (re.test(trimmed)) {
        if (!seenCrit.has(trimmed)) {
          seenCrit.add(trimmed);
          critical.push(trimmed);
        }
        matchedCrit = true;
        break;
      }
    }
    if (matchedCrit) continue;

    for (const re of LOG_WARNING_PATTERNS) {
      if (re.test(trimmed)) {
        if (!seenWarn.has(trimmed)) {
          seenWarn.add(trimmed);
          warning.push(trimmed);
        }
        break;
      }
    }
  }

  return { critical, warning };
}
