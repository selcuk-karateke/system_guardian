import {
  getGlobalCrisisStage,
  getServerOverview,
} from "@/lib/dashboard-data";
import { crisisStageToWallTone } from "@/lib/crisis/stages";
import { buildGlobeTints } from "@/lib/geo/attack-markers";
import { getLatestCheckDataByModule } from "@/lib/monitor-details";
import { displayHostFromServer } from "@/lib/server-scope";
import { listActiveServers } from "@/lib/servers";

export async function loadMonitorGlobeView(serverParam?: string) {
  const serverRows = await listActiveServers().catch(() => []);
  const selectedServerId =
    serverRows.find((s) => s.id === serverParam)?.id ??
    serverRows[0]?.id ??
    "";

  let globalStatus: "healthy" | "warning" | "critical" = "healthy";
  let overview: Awaited<ReturnType<typeof getServerOverview>> | null = null;
  let checkData: Record<string, Record<string, unknown>> = {};

  try {
    const [crisisStage, ov, data] = await Promise.all([
      getGlobalCrisisStage(selectedServerId || undefined),
      getServerOverview(selectedServerId || undefined),
      getLatestCheckDataByModule(selectedServerId || undefined),
    ]);
    globalStatus = crisisStageToWallTone(crisisStage);
    overview = ov;
    checkData = data;
  } catch {
    /* empty */
  }

  const { hostLabel, hostIp, homeIp } = displayHostFromServer(
    overview?.server,
  );

  const tints = await buildGlobeTints(checkData, { homeIp });

  return {
    serverRows,
    selectedServerId,
    globalStatus,
    hostLabel,
    hostIp,
    checkMode: overview?.checkMode ?? "mock",
    ...tints,
  };
}
