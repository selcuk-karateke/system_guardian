/** Verdächtige Prozess-Kommandozeilen (Miner, Reverse Shell, Download-Pipe). */
export const PROCESS_SUSPICIOUS_PATTERNS: RegExp[] = [
  /\bxmrig\b/i,
  /\bminerd\b/i,
  /\bkinsing\b/i,
  /\bcryptonight\b/i,
  /\bstratum\+tcp/i,
  /\/dev\/tcp\//,
  /\bbash\s+-i\b/,
  /\bnc\s+.*\s-e\s/i,
  /\bpython3?\s+-c\s+.*socket/i,
  /\bcurl\s[^\n|]*\|\s*(ba)?sh/i,
  /\bwget\s[^\n]*\|\s*(ba)?sh/i,
  /\bchmod\s+[+-]?[xX].*\/tmp\//i,
];

/** Prozesse aus temporären Pfaden sind oft Malware-Payload. */
export const PROCESS_RISKY_PATH_PATTERNS: RegExp[] = [
  /\s\/tmp\/[^\s]+/,
  /\s\/dev\/shm\/[^\s]+/,
  /\(deleted\)/,
];

export function isSuspiciousProcessLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (PROCESS_SUSPICIOUS_PATTERNS.some((p) => p.test(trimmed))) return true;
  if (PROCESS_RISKY_PATH_PATTERNS.some((p) => p.test(trimmed))) return true;
  return false;
}

export function parsePsAuxLines(stdout: string): string[] {
  const lines = stdout.split("\n").filter(Boolean);
  if (lines.length <= 1) return [];
  return lines.slice(1);
}
