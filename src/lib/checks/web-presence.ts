import { maskLoginIp } from "@/lib/config";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

const WINDOW = "15m";
const LOG_TAIL = 400;

export type UaClass = "browser" | "bot" | "other";

export type WebHit = {
  ip: string;
  ipMasked: string;
  method: string;
  path: string;
  host: string;
  status: number;
  userAgent: string;
  uaClass: UaClass;
  at?: string;
};

export type WebVisitor = {
  ip: string;
  ipMasked: string;
  host: string;
  path: string;
  method: string;
  status: number;
  uaClass: UaClass;
  userAgent: string;
  hits: number;
  lastAt?: string;
};

export type WebPresenceData = {
  window: string;
  proxyContainer: string | null;
  uniqueIps: number;
  visitorCount: number;
  botCount: number;
  error4xx: number;
  error5xx: number;
  visitors: WebVisitor[];
  bots: WebVisitor[];
  topPaths: { path: string; count: number }[];
};

const BOT_UA =
  /bot|crawler|spider|slurp|semrush|ahrefs|bingpreview|facebookexternalhit|bytespider|gptbot|claudebot|curl\/|wget\/|python-requests|go-http-client/i;
const BROWSER_UA = /mozilla\/|chrome\/|safari\/|firefox\/|edg\//i;

export function classifyUserAgent(ua: string): UaClass {
  if (!ua || ua === "-") return "other";
  if (BOT_UA.test(ua)) return "bot";
  if (BROWSER_UA.test(ua)) return "browser";
  return "other";
}

/** Parse one Traefik JSON access line or Apache/CLF-ish line. */
export function parseAccessLogLine(line: string): WebHit | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      const row = JSON.parse(trimmed) as Record<string, unknown>;
      const ip = String(
        row.ClientHost ?? row.ClientAddr ?? row.clientHost ?? "",
      ).replace(/:\d+$/, "");
      const method = String(row.RequestMethod ?? row.request_method ?? "GET");
      const path = String(row.RequestPath ?? row.request_path ?? "/").split("?")[0];
      const host = String(row.RequestHost ?? row.request_host ?? "");
      const status = Number(
        row.DownstreamStatus ?? row.downstream_Status ?? row.StatusCode ?? 0,
      );
      const userAgent = String(
        row.RequestUserAgent ?? row.request_User_Agent ?? row.UserAgent ?? "-",
      );
      const at = String(row.StartUTC ?? row.startUTC ?? row.time ?? "");
      if (!ip || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return null;
      return {
        ip,
        ipMasked: maskLoginIp(ip),
        method,
        path: path || "/",
        host,
        status: Number.isFinite(status) ? status : 0,
        userAgent,
        uaClass: classifyUserAgent(userAgent),
        at: at || undefined,
      };
    } catch {
      return null;
    }
  }

  // Combined / common log: IP - - [date] "METHOD path proto" status size "ref" "ua"
  const clf = trimmed.match(
    /^(\d{1,3}(?:\.\d{1,3}){3})\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)[^"]*"\s+(\d{3})\s+\S+\s+"[^"]*"\s+"([^"]*)"/,
  );
  if (clf) {
    const userAgent = clf[6] || "-";
    return {
      ip: clf[1],
      ipMasked: maskLoginIp(clf[1]),
      method: clf[3],
      path: clf[4].split("?")[0] || "/",
      host: "",
      status: parseInt(clf[5], 10) || 0,
      userAgent,
      uaClass: classifyUserAgent(userAgent),
      at: clf[2],
    };
  }

  return null;
}

export function aggregateWebPresence(
  hits: WebHit[],
  proxyContainer: string | null,
): WebPresenceData {
  const byIp = new Map<string, WebVisitor>();
  const pathCounts = new Map<string, number>();
  let error4xx = 0;
  let error5xx = 0;

  for (const hit of hits) {
    if (hit.status >= 500) error5xx += 1;
    else if (hit.status >= 400) error4xx += 1;

    const pathKey = hit.host ? `${hit.host}${hit.path}` : hit.path;
    pathCounts.set(pathKey, (pathCounts.get(pathKey) ?? 0) + 1);

    const prev = byIp.get(hit.ip);
    if (!prev) {
      byIp.set(hit.ip, {
        ip: hit.ip,
        ipMasked: hit.ipMasked,
        host: hit.host,
        path: hit.path,
        method: hit.method,
        status: hit.status,
        uaClass: hit.uaClass,
        userAgent: hit.userAgent.slice(0, 120),
        hits: 1,
        lastAt: hit.at,
      });
    } else {
      prev.hits += 1;
      prev.host = hit.host || prev.host;
      prev.path = hit.path;
      prev.method = hit.method;
      prev.status = hit.status;
      prev.uaClass = hit.uaClass;
      prev.userAgent = hit.userAgent.slice(0, 120);
      prev.lastAt = hit.at ?? prev.lastAt;
    }
  }

  const all = [...byIp.values()].sort((a, b) => b.hits - a.hits);
  const bots = all.filter((v) => v.uaClass === "bot");
  const visitors = all.filter((v) => v.uaClass !== "bot");

  const topPaths = [...pathCounts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    window: WINDOW,
    proxyContainer,
    uniqueIps: all.length,
    visitorCount: visitors.length,
    botCount: bots.length,
    error4xx,
    error5xx,
    visitors: visitors.slice(0, 25),
    bots: bots.slice(0, 25),
    topPaths,
  };
}

function resolveProxyAndLogsScript(): string {
  return [
    `PROXY=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -Ei 'coolify-proxy|^traefik|traefik' | head -1)`,
    `if [ -z "$PROXY" ]; then echo 'NO_PROXY'; exit 0; fi`,
    `echo "PROXY:$PROXY"`,
    `docker logs "$PROXY" --since ${WINDOW} 2>&1 | tail -${LOG_TAIL}`,
  ].join("; ");
}

export async function runWebPresenceCheck(serverId: string): Promise<CheckResult> {
  const ssh = await getSshClient(serverId);
  const { stdout } = await ssh.exec(resolveProxyAndLogsScript());

  const alerts: AlertInput[] = [];
  const lines = stdout.split("\n");
  let proxyContainer: string | null = null;
  const hitLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("PROXY:")) {
      proxyContainer = line.slice("PROXY:".length).trim() || null;
      continue;
    }
    if (line.trim() === "NO_PROXY") {
      proxyContainer = null;
      continue;
    }
    hitLines.push(line);
  }

  const hits = hitLines
    .map(parseAccessLogLine)
    .filter((h): h is WebHit => h != null);

  const data = aggregateWebPresence(hits, proxyContainer);

  return {
    module: "web_presence",
    status: "healthy",
    data,
    alerts,
  };
}
