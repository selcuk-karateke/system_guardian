import { isTrustedOutboundKey } from "@/lib/config";
import { diffStringSets } from "@/lib/history/diff";
import { diffAndStore } from "@/lib/history/persist";
import { getSshClient } from "@/lib/ssh";
import {
  formatEstablishedConn,
  isOutboundEstablished,
  isSuspiciousConnection,
  parseSsTunapLine,
} from "./connection-patterns";
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

  const ssh = getSshClient();
  const { stdout } = await ssh.exec(
    "ss -tunap 2>/dev/null | head -500 || ss -tunap 2>/dev/null | head -500",
  );
  const suspiciousConns: string[] = [];
  const outboundEstablished: string[] = [];

  for (const line of stdout.split("\n")) {
    const conn = parseSsTunapLine(line);
    if (!conn) continue;

    if (isOutboundEstablished(conn)) {
      outboundEstablished.push(formatEstablishedConn(conn));
    }

    const hit = isSuspiciousConnection(conn);
    if (!hit) continue;
    suspiciousConns.push(`${hit.reason} · ${line.slice(0, 160)}`);
    if (hit.severity === "critical") status = "critical";
    else if (status === "healthy") status = "warning";
    alerts.push({
      level: hit.severity,
      message: `Suspicious connection: ${hit.reason}`,
      recommendation:
        "ss -tunap + docker ps; block IP (ufw), stop container, check image digest",
    });
    if (suspiciousConns.length >= 10) break;
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
