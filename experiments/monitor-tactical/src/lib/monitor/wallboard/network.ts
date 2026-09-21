import { worstStatus } from "@/lib/config";
import type { CheckStatus } from "@/lib/checks/types";
import { WALLBOARD_DOMAINS } from "./types";
import type { WallboardNetworkNode, WallboardNetworkTactical } from "./types";
import { moduleLabel } from "./helpers";

function buildNetworkNodes(
  checkData: Record<string, Record<string, unknown>>,
  hostIp: string,
): WallboardNetworkNode[] {
  const anchors: WallboardNetworkNode[] = [
    { id: "cf", label: "Cloudflare", active: false, angle: -70 },
    { id: "gh", label: "GitHub", active: false, angle: -25 },
    { id: "hz", label: "Hetzner", active: false, angle: 25 },
    { id: "ai", label: "OpenAI", active: false, angle: 70 },
    { id: "client", label: "Client", active: false, angle: 140 },
    { id: "coolify", label: "Coolify", active: false, angle: 180 },
  ];

  const net = checkData.network;
  const conns =
    (net?.outboundEstablished as string[] | undefined) ??
    (net?.suspiciousConnections as string[] | undefined) ??
    [];

  for (const line of conns) {
    const lower = line.toLowerCase();
    if (/cloudflare|1\.1\.1\.1|cf-/.test(lower))
      anchors.find((n) => n.id === "cf")!.active = true;
    if (/github|ghcr/.test(lower))
      anchors.find((n) => n.id === "gh")!.active = true;
    if (/openai/.test(lower))
      anchors.find((n) => n.id === "ai")!.active = true;
    if (/10\.0\.1\.|coolify/.test(lower))
      anchors.find((n) => n.id === "coolify")!.active = true;
    if (/188\.194\.|client/.test(lower))
      anchors.find((n) => n.id === "client")!.active = true;
    if (hostIp && line.includes(hostIp.split(".").slice(0, 2).join(".")))
      anchors.find((n) => n.id === "hz")!.active = true;
    if (/49\.12\.|hetzner/.test(lower))
      anchors.find((n) => n.id === "hz")!.active = true;
  }

  if (!anchors.some((n) => n.active) && conns.length > 0) {
    anchors.find((n) => n.id === "hz")!.active = true;
  }

  return anchors;
}

export function buildNetworkTactical(
  statusMap: Record<string, string>,
  checkData: Record<string, Record<string, unknown>>,
  hostIp: string,
): WallboardNetworkTactical {
  const nodes = buildNetworkNodes(checkData, hostIp);
  const activeLinks = nodes.filter((n) => n.active).length;
  const net = checkData.network;
  const conns =
    (net?.outboundEstablished as string[] | undefined)?.length ??
    (net?.suspiciousConnections as string[] | undefined)?.length ??
    0;

  const scannerStatus = (statusMap.scanner ?? "unknown") as CheckStatus;
  const installed =
    (checkData.scanner?.installed as string[] | undefined) ?? [];
  const scannerDetail =
    installed.length > 0 ? installed.join(", ") : "No scanner tools";

  const outages = WALLBOARD_DOMAINS.network.modules
    .map((m) => ({
      module: m,
      label: moduleLabel(m),
      status: (statusMap[m] ?? "unknown") as CheckStatus,
    }))
    .filter((o) => o.status === "warning" || o.status === "critical");

  const domainStatus = worstStatus(
    WALLBOARD_DOMAINS.network.modules.map(
      (m) => (statusMap[m] ?? "unknown") as CheckStatus,
    ),
  );

  return {
    domainStatus,
    activeLinks: activeLinks || Math.min(conns, 6),
    totalNodes: nodes.length,
    scannerStatus,
    scannerDetail,
    outages,
    nodes,
  };
}
