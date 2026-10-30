import {
  getGlobalStatus,
  getServerOverview,
} from "@/lib/dashboard-data";
import { buildGlobeTints } from "@/lib/geo/attack-markers";
import { getLatestCheckDataByModule } from "@/lib/monitor-details";
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
    [globalStatus, overview, checkData] = await Promise.all([
      getGlobalStatus(selectedServerId || undefined),
      getServerOverview(selectedServerId || undefined),
      getLatestCheckDataByModule(selectedServerId || undefined),
    ]);
  } catch {
    /* empty */
  }

  const sshHost = process.env.SSH_HOST;
  const hostIp =
    sshHost ?? overview?.server?.ipv4 ?? overview?.server?.host ?? "—";
  const hostLabel =
    sshHost && overview?.server?.name === "Primary Server"
      ? "Production"
      : (overview?.server?.name ?? "Server");

  const homeIpCandidate =
    overview?.server?.ipv4 ??
    (sshHost && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(sshHost) ? sshHost : null);

  const tints = await buildGlobeTints(checkData, { homeIp: homeIpCandidate });

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
