import {
  getBlockedRemoteIps,
  isAutoBlockEnabled,
  isTrustedOutboundKey,
} from "@/lib/config";
import { diffStringSets } from "@/lib/history/diff";
import { diffAndStore } from "@/lib/history/persist";
import { enforceBlocklistBans } from "@/lib/protect/auto-block";
import {
  blockedIpRecommendation,
  suspiciousOutboundRecommendation,
} from "@/lib/protect/playbooks";
import { getSshClient } from "@/lib/ssh";
import {
  formatEstablishedConn,
  isOutboundEstablished,
  isSuspiciousConnection,
  parseSsTunapLine,
} from "./connection-patterns";
import {
  enrichReasonWithContainer,
  parsePidFromSsProcess,
  resolveContainersByPids,
} from "./container-process";
import { runPortsCheck } from "./ports";
import type { AlertInput, CheckResult } from "./types";

/** Network monitoring: listeners + verdächtige ESTAB-Verbindungen */
export async function runNetworkCheck(serverId: string): Promise<CheckResult> {
  const portsResult = await runPortsCheck(serverId);
  const publicPorts = ((portsResult.data.ports as string[]) ?? []).filter((p) =>
    ["22", "80", "443", "3000", "8080", "5432", "3306"].includes(p),
  );

  const alerts: AlertInput[] = [...portsResult.alerts];
  let status = portsResult.status;
  const extraPorts = ((portsResult.data.ports as string[]) ?? []).filter(
    (p) => !["22", "80", "443"].includes(p),
  );

  if (extraPorts.length > 5) {
    alerts.push({
      level: "info",
      message: `${extraPorts.length} non-standard ports listening`,
    });
  }

  const ssh = await getSshClient(serverId);
  const { stdout } = await ssh.exec(
    "ss -tunap 2>/dev/null | head -500 || ss -tunap 2>/dev/null | head -500",
  );
  const suspiciousConns: string[] = [];
  const outboundEstablished: string[] = [];

  type HitRow = {
    line: string;
    conn: NonNullable<ReturnType<typeof parseSsTunapLine>>;
    hit: NonNullable<ReturnType<typeof isSuspiciousConnection>>;
  };
  const hitRows: HitRow[] = [];

  for (const line of stdout.split("\n")) {
    const conn = parseSsTunapLine(line);
    if (!conn) continue;

    if (isOutboundEstablished(conn)) {
      outboundEstablished.push(formatEstablishedConn(conn));
    }

    const hit = isSuspiciousConnection(conn);
    if (!hit) continue;
    hitRows.push({ line, conn, hit });
    if (hitRows.length >= 10) break;
  }

  const containerByPid = await resolveContainersByPids(
    ssh,
    hitRows
      .map((r) => parsePidFromSsProcess(r.conn.process))
      .filter((p): p is number => p != null),
  );

  const blockedSet = getBlockedRemoteIps();
  const blockedSeen: string[] = [];

  for (const { line, conn, hit } of hitRows) {
    const pid = parsePidFromSsProcess(conn.process);
    const container = pid != null ? containerByPid.get(pid) : undefined;
    const reason = enrichReasonWithContainer(hit.reason, container);
    suspiciousConns.push(`${reason} · ${line.slice(0, 160)}`);
    if (hit.severity === "critical") status = "critical";
    else if (status === "healthy") status = "warning";

    const isBlockedIp = blockedSet.has(conn.remoteIp);
    if (isBlockedIp) blockedSeen.push(conn.remoteIp);

    alerts.push({
      level: hit.severity,
      message: `Suspicious connection: ${reason}`,
      recommendation: isBlockedIp
        ? blockedIpRecommendation(conn.remoteIp, {
            autoBlockEnabled: isAutoBlockEnabled(),
          })
        : suspiciousOutboundRecommendation(Boolean(container?.containerId)),
    });
  }

  if (blockedSeen.length > 0) {
    const blockResult = await enforceBlocklistBans(serverId, blockedSeen);
    alerts.push(...blockResult.alerts);
    if (blockResult.banned.length > 0 || blockResult.alerts.some((a) => a.level === "critical")) {
      status = "critical";
    }
  }

  const outboundKeys = outboundEstablished.map((s) => s.slice(0, 120));
  const { diffs: outboundDiffs, isBaseline: outboundBaseline } =
    await diffAndStore(
      serverId,
      "outbound_connections",
      { connections: outboundKeys },
      (prev, curr) => {
        const prevList = (prev?.connections as string[]) ?? [];
        const currList = curr.connections as string[];
        return diffStringSets(prevList, currList);
      },
    );

  if (outboundBaseline) {
    alerts.push({
      level: "info",
      message: `Outbound baseline (${outboundKeys.length} Verbindung(en))`,
    });
  }
  for (const d of outboundDiffs) {
    if (d.changeType !== "added") continue;
    if (isTrustedOutboundKey(d.entityKey)) continue;
    alerts.push({
      level: "warning",
      message: `Neue ausgehende Verbindung: ${d.entityKey.slice(0, 100)}`,
      recommendation: "Historie unter /history prüfen",
    });
    if (status === "healthy") status = "warning";
  }

  return {
    ...portsResult,
    module: "network",
    status,
    data: {
      ...portsResult.data,
      publicPorts,
      listenerCount: (portsResult.data.ports as string[])?.length ?? 0,
      suspiciousConnections: suspiciousConns.slice(0, 12),
      outboundEstablished: outboundEstablished.slice(0, 40),
      outboundCount: outboundEstablished.length,
    },
    alerts,
  };
}
