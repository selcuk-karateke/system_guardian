import type { metricsSnapshots } from "@/db/schema";
import { worstStatus } from "@/lib/config";
import type { CheckStatus } from "@/lib/checks/types";
import {
  WALLBOARD_DOMAINS,
  type WallboardData,
  type WallboardDomainId,
} from "./types";
import { domainScore, statusScore } from "./helpers";
import { buildWallboardEvents } from "./events";
import { buildNetworkTactical } from "./network";
import { buildDockerSummary } from "./docker";
import { buildSecurity } from "./security";

export function buildWallboardData(input: {
  statusMap: Record<string, string>;
  checkData: Record<string, Record<string, unknown>>;
  metrics: typeof metricsSnapshots.$inferSelect | null | undefined;
  alerts: {
    id: string;
    level: string;
    module: string;
    message: string;
    createdAt: Date;
  }[];
  changeEvents: {
    id: string;
    category: string;
    changeType: string;
    entityKey: string;
    createdAt: Date;
  }[];
  hostIp: string;
  uptimeLabel: string;
}): WallboardData {
  const { statusMap, checkData, metrics, alerts, changeEvents, hostIp, uptimeLabel } =
    input;

  const allModules = Object.values(WALLBOARD_DOMAINS).flatMap((d) => d.modules);
  const scores = allModules.map((m) => statusScore(statusMap[m] ?? "unknown"));
  const healthScore = Math.round(
    scores.reduce((a, b) => a + b, 0) / scores.length,
  );

  const counts = { healthy: 0, warning: 0, critical: 0 };
  for (const m of allModules) {
    const s = statusMap[m];
    if (s === "healthy") counts.healthy++;
    else if (s === "warning") counts.warning++;
    else if (s === "critical") counts.critical++;
  }

  const globalStatus = worstStatus(
    allModules.map((m) => (statusMap[m] ?? "unknown") as CheckStatus),
  );

  const domains = (Object.keys(WALLBOARD_DOMAINS) as WallboardDomainId[]).map(
    (id) => {
      const def = WALLBOARD_DOMAINS[id];
      const { score, status, hint } = domainScore(def.modules, statusMap);
      return { id, label: def.label, score, status, hint };
    },
  );

  const serverHints: string[] = [];
  if (metrics?.loadAvg1 != null && metrics.cpuCores) {
    serverHints.push(`Load ${metrics.loadAvg1}/${metrics.cpuCores}`);
  }
  if (metrics?.ramPercent != null) serverHints.push(`RAM ${metrics.ramPercent}%`);
  if (metrics?.diskPercent != null) serverHints.push(`Disk ${metrics.diskPercent}%`);
  serverHints.push(`Uptime ${uptimeLabel}`);

  return {
    globalStatus,
    healthScore,
    counts,
    domains,
    serverHints,
    events: buildWallboardEvents({ alerts, changeEvents }),
    network: buildNetworkTactical(statusMap, checkData, hostIp),
    docker: buildDockerSummary(checkData, statusMap),
    security: buildSecurity(statusMap, checkData),
  };
}
