import { isTrustedLoginIp, maskLoginIp } from "@/lib/config";

/** Active SSH/shell session on the monitored host (from who / w). */
export type ActiveSession = {
  user: string;
  tty: string;
  from: string;
  fromMasked: string;
  loginAt?: string;
  idle?: string;
  what?: string;
  trusted: boolean;
};

export type FailedAuthSource = {
  ip: string;
  ipMasked: string;
  count: number;
  trusted: boolean;
};

/**
 * Parse `w -h` lines.
 * Typical: USER TTY FROM LOGIN@ IDLE JCPU PCPU WHAT
 */
export function parseWLines(stdout: string): ActiveSession[] {
  const sessions: ActiveSession[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line || /^USER\s+TTY/i.test(line)) continue;
    // Split into 8 columns max; WHAT may contain spaces
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;
    const user = parts[0];
    const tty = parts[1];
    // FROM can be "-" for local console
    const from = parts[2] === "-" ? "local" : parts[2];
    const loginAt = parts[3];
    const idle = parts[4];
    const what = parts.length > 7 ? parts.slice(7).join(" ") : parts.slice(5).join(" ");
    const fromIp = extractIp(from) ?? from;
    sessions.push({
      user,
      tty,
      from: fromIp,
      fromMasked: looksLikeIp(fromIp) ? maskLoginIp(fromIp) : fromIp,
      loginAt,
      idle,
      what: what || undefined,
      trusted: looksLikeIp(fromIp) ? isTrustedLoginIp(fromIp) : fromIp === "local",
    });
  }
  return sessions;
}

/**
 * Parse `who` lines as fallback when w is empty.
 * Typical: user pts/0 2026-06-03 08:00 (203.0.113.10)
 */
export function parseWhoLines(stdout: string): ActiveSession[] {
  const sessions: ActiveSession[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const paren = line.match(
      /^(\S+)\s+(\S+)\s+(.+?)\s+\(([^)]+)\)\s*$/,
    );
    if (paren) {
      const fromIp = extractIp(paren[4]) ?? paren[4];
      sessions.push({
        user: paren[1],
        tty: paren[2],
        from: fromIp,
        fromMasked: looksLikeIp(fromIp) ? maskLoginIp(fromIp) : fromIp,
        loginAt: paren[3].trim(),
        trusted: looksLikeIp(fromIp) ? isTrustedLoginIp(fromIp) : false,
      });
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const from = parts[parts.length - 1];
    const fromIp = extractIp(from) ?? from;
    sessions.push({
      user: parts[0],
      tty: parts[1],
      from: fromIp,
      fromMasked: looksLikeIp(fromIp) ? maskLoginIp(fromIp) : fromIp,
      loginAt: parts.slice(2, -1).join(" ") || undefined,
      trusted: looksLikeIp(fromIp) ? isTrustedLoginIp(fromIp) : false,
    });
  }
  return sessions;
}

/** Prefer w (idle/what); fall back to who. */
export function mergeActiveSessions(
  whoStdout: string,
  wStdout: string,
): ActiveSession[] {
  const fromW = parseWLines(wStdout);
  if (fromW.length > 0) return fromW;
  return parseWhoLines(whoStdout);
}

export function parseFailedAuthSources(authStdout: string): FailedAuthSource[] {
  const counts = new Map<string, number>();
  for (const line of authStdout.split("\n")) {
    if (!line.includes("Failed password")) continue;
    const ipMatch = line.match(/from\s+(\S+)/);
    if (!ipMatch) continue;
    const ip = ipMatch[1];
    counts.set(ip, (counts.get(ip) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([ip, count]) => ({
      ip,
      ipMasked: maskLoginIp(ip),
      count,
      trusted: isTrustedLoginIp(ip),
    }))
    .sort((a, b) => b.count - a.count);
}

function looksLikeIp(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

function extractIp(value: string): string | null {
  const m = value.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  return m?.[1] ?? null;
}
