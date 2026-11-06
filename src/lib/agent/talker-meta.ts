import type { AgentTalker, AgentTalkerKind } from "@/lib/agent/types";

const PORT_KIND: Record<number, AgentTalkerKind> = {
  22: "ssh",
  2222: "ssh",
  443: "https",
  8443: "https",
  80: "http",
  8080: "http",
  8000: "http",
  873: "rsync",
  21: "ftp",
  25: "smtp",
  465: "smtp",
  587: "smtp",
  3306: "db",
  5432: "db",
  27017: "db",
  6379: "db",
  445: "smb",
  139: "smb",
  2049: "nfs",
  9418: "git",
  53: "dns",
};

const PROC_KIND: Array<{ re: RegExp; kind: AgentTalkerKind }> = [
  { re: /^(rsync|rclone)$/i, kind: "rsync" },
  { re: /^(scp|sftp|ssh|sshd)$/i, kind: "ssh" },
  { re: /^(curl|wget|http)/i, kind: "https" },
  { re: /^(pg_dump|mysqldump|mariadb-dump|mongoexport)/i, kind: "db" },
  { re: /^(git)$/i, kind: "git" },
  { re: /^(smbclient|smbd)$/i, kind: "smb" },
];

export function classifyTalkerKind(
  process: string,
  remotePort: number | null,
): AgentTalkerKind {
  const base = process.split(/[\s/]/)[0] ?? process;
  for (const { re, kind } of PROC_KIND) {
    if (re.test(base)) return kind;
  }
  if (remotePort != null && PORT_KIND[remotePort]) {
    return PORT_KIND[remotePort];
  }
  return "other";
}

const SECRET_RE =
  /(?<=(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|auth)=)\S+/gi;

/** Strip obvious secrets and collapse whitespace for HUD. */
export function sanitizeCmdline(raw: string, max = 140): string {
  let s = raw.replace(/\0/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(SECRET_RE, "***");
  // Long opaque tokens
  s = s.replace(/\b[A-Za-z0-9+/=_-]{40,}\b/g, "[redacted]");
  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s;
}

function formatBps(bps: number): string {
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} MB/s`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${Math.round(n)} B`;
}

function pickTop(talkers: AgentTalker[]): AgentTalker | null {
  const established = talkers
    .filter((t) => t.state === "established")
    .sort((a, b) => b.txBps - a.txBps);
  if (established[0]) return established[0];
  return [...talkers].sort((a, b) => b.txBps - a.txBps)[0] ?? null;
}

/**
 * Compact HUD line: process/kind → ip · rate · active · what (files|cmdline)
 */
export function formatTopTalkerLine(talkers: AgentTalker[]): string | null {
  const top = pickTop(talkers);
  if (!top) return null;
  const kind = top.kind ?? classifyTalkerKind(top.process, top.remotePort);
  const peer = `${top.remoteIp}${
    top.remotePort != null ? `:${top.remotePort}` : ""
  }`;
  const head = `${top.process}/${kind} → ${peer}`;
  if (top.state !== "established") {
    return `${head} · nicht mehr established`;
  }
  const active = top.stillActive ? "noch aktiv" : "gerade gesehen";
  const parts = [head, `↑ ${formatBps(top.txBps)}`, active];
  if (top.txBytes != null && top.txBytes > 0) {
    parts.push(formatBytes(top.txBytes));
  }
  const what = talkerWhatHint(top);
  if (what) parts.push(what);
  return parts.join(" · ");
}

/** Longer line for alerts / recommendations. */
export function formatTopTalkerDetail(talkers: AgentTalker[]): string | null {
  const top = pickTop(talkers);
  if (!top) return null;
  const kind = top.kind ?? classifyTalkerKind(top.process, top.remotePort);
  const peer = `${top.remoteIp}${
    top.remotePort != null ? `:${top.remotePort}` : ""
  }`;
  const bits = [
    `${top.process} (${kind}) → ${peer}`,
    `↑ ${formatBps(top.txBps)}`,
    top.stillActive ? "noch aktiv" : "gerade gesehen",
  ];
  if (top.txBytes != null && top.txBytes > 0) {
    bits.push(`${formatBytes(top.txBytes)} im Sample`);
  }
  if (top.cmdline) bits.push(`cmd: ${top.cmdline}`);
  if (top.openFiles?.length) {
    bits.push(`Dateien: ${top.openFiles.join(", ")}`);
  }
  return bits.join(" · ");
}

/** Short “what left” hint for HUD. */
export function talkerWhatHint(t: AgentTalker): string | null {
  if (t.openFiles && t.openFiles.length > 0) {
    return t.openFiles[0]!;
  }
  if (t.cmdline) {
    // Prefer path-like tokens from cmdline
    const paths = t.cmdline.match(/(\/[\w./@+-]{4,})/g);
    if (paths?.length) {
      const interesting = paths.find(
        (p) =>
          !p.startsWith("/usr/") &&
          !p.startsWith("/bin/") &&
          !p.startsWith("/lib") &&
          !p.startsWith("/proc"),
      );
      if (interesting) return interesting;
    }
    return t.cmdline.length > 48 ? `${t.cmdline.slice(0, 47)}…` : t.cmdline;
  }
  const kind = t.kind ?? classifyTalkerKind(t.process, t.remotePort);
  if (kind === "ssh") return "Inhalt: SSH-Tunnel (verschlüsselt)";
  if (kind === "https") return "Inhalt: TLS (verschlüsselt)";
  if (kind === "rsync") return "Inhalt: Dateisync (Pfad in cmdline?)";
  if (kind === "db") return "Inhalt: DB-Export/-Replikat";
  return null;
}
