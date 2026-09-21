import {
  getBlockedRemoteIps,
  getTrustedOutboundProcessPatterns,
} from "@/lib/config";

/** Bekannte Mining / C2 / Reverse-Shell Ports */
export const SUSPICIOUS_REMOTE_PORTS = new Set([
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "14444",
  "45700",
  "8393",
  "9201",
  "10128",
]);

const PRIVATE_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fe80:)/i;

/** Local ports where ESTAB = client connected inbound (not server-initiated outbound) */
const INBOUND_LISTENER_PORTS = new Set([
  "22",
  "80",
  "443",
  "3000",
  "8080",
  "5432",
  "3306",
]);

export function parseLocalPort(local: string): string {
  if (!local) return "";
  const ipv6 = local.match(/^\[.*\]:(\d+)$/);
  if (ipv6) return ipv6[1];
  const idx = local.lastIndexOf(":");
  if (idx < 0) return "";
  return local.slice(idx + 1);
}

/** SSH/HTTP/DB listener — remote:highport ← local:service is inbound, not outbound */
export function isInboundEstablished(conn: ParsedConnection): boolean {
  const localPort = parseLocalPort(conn.local);
  if (INBOUND_LISTENER_PORTS.has(localPort)) return true;
  if (localPort === "22" && /sshd/i.test(conn.process)) return true;
  return false;
}

export function isPrivateOrLocalIp(ip: string): boolean {
  return PRIVATE_IP.test(ip.trim());
}

export interface ParsedConnection {
  proto: string;
  state: string;
  local: string;
  remote: string;
  remoteIp: string;
  remotePort: string;
  process: string;
}

export function parseSsTunapLine(line: string): ParsedConnection | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("Netid")) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 5) return null;

  const proto = parts[0];
  const state = parts[1];
  const local = parts[4] ?? "";
  const remote = parts[5] ?? "";
  const process = trimmed.includes("users:") ? trimmed.slice(trimmed.indexOf("users:")) : "";

  const remoteMatch = remote.match(/^\[?([^\]]+?)\]?:?(\d+)?$/);
  let remoteIp = remote;
  let remotePort = "";
  if (remote.includes(":")) {
    const lastColon = remote.lastIndexOf(":");
    remoteIp = remote.slice(0, lastColon).replace(/^\[|\]$/g, "");
    remotePort = remote.slice(lastColon + 1);
  } else if (remoteMatch) {
    remoteIp = remoteMatch[1];
    remotePort = remoteMatch[2] ?? "";
  }

  return {
    proto,
    state,
    local,
    remote,
    remoteIp,
    remotePort,
    process,
  };
}

function isTrustedOutboundProcess(process: string): boolean {
  return getTrustedOutboundProcessPatterns().some((re) => re.test(process));
}

export function isOutboundEstablished(conn: ParsedConnection): boolean {
  if (conn.state !== "ESTAB") return false;
  if (isInboundEstablished(conn)) return false;
  if (isPrivateOrLocalIp(conn.remoteIp)) return false;
  if (conn.remote === "*:*" || conn.remote.endsWith(":*")) return false;
  return true;
}

export type ConnectionSeverity = "critical" | "warning";

export function isSuspiciousConnection(
  conn: ParsedConnection,
): { reason: string; severity: ConnectionSeverity } | null {
  if (!isOutboundEstablished(conn)) return null;

  const blocked = getBlockedRemoteIps();
  if (blocked.has(conn.remoteIp)) {
    return {
      severity: "critical",
      reason: `BSI/incident IP ${conn.remoteIp}:${conn.remotePort || "?"} (${conn.process.slice(0, 80)})`,
    };
  }

  if (conn.remotePort && SUSPICIOUS_REMOTE_PORTS.has(conn.remotePort)) {
    return {
      severity: "critical",
      reason: `Connection to port ${conn.remotePort} (${conn.remote})`,
    };
  }

  if (
    /\/tmp\/|\/dev\/shm\/|\(deleted\)/i.test(conn.process) &&
    !isPrivateOrLocalIp(conn.remoteIp)
  ) {
    return {
      severity: "critical",
      reason: `Outbound from temp path: ${conn.process.slice(0, 120)}`,
    };
  }

  if (
    (conn.remotePort === "80" || conn.remotePort === "443") &&
    !isTrustedOutboundProcess(conn.process)
  ) {
    return {
      severity: "warning",
      reason: `Outbound ${conn.remotePort} to ${conn.remoteIp} (${conn.process.slice(0, 80)})`,
    };
  }

  return null;
}

export function formatEstablishedConn(conn: ParsedConnection): string {
  return `${conn.proto} ${conn.remote} ← ${conn.local} ${conn.process.slice(0, 100)}`;
}
