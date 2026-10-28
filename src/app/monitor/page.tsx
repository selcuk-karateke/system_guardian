import { Suspense } from "react";
import { MonitorAutoRefresh } from "@/components/dashboard/monitor-auto-refresh";
import { MonitorTvProtection } from "@/components/dashboard/monitor-tv-protection";
import { MonitorWall } from "@/components/dashboard/monitor-wall";
import { ServerSelect } from "@/components/dashboard/server-select";
import {
  getMonitorNightEndHour,
  getMonitorNightStartHour,
  getMonitorPixelShiftSec,
  isMonitorNightModeEnabled,
} from "@/lib/config";
import {
  getAllModuleStatuses,
  getGlobalStatus,
  getLastCheckTime,
  getRecentAlerts,
  getServerOverview,
  rollupRelatedModuleStatuses,
} from "@/lib/dashboard-data";
import { fimPathsFromAlerts } from "@/lib/alerts/fim-paths";
import {
  buildMonitorMetricCards,
  formatModuleDetailLines,
  getLatestCheckDataByModule,
} from "@/lib/monitor-details";
import { MONITOR_MODULE_ORDER, MONITOR_PLACEHOLDER_MODULES } from "@/lib/module-labels";
import { listActiveServers } from "@/lib/servers";
import { formatUptime } from "@/lib/utils";

export default async function MonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ server?: string }>;
}) {
  const sp = await searchParams;
  const serverRows = await listActiveServers().catch(() => []);
  const selectedServerId =
    serverRows.find((s) => s.id === sp.server)?.id ??
    serverRows[0]?.id ??
    "";

  let globalStatus: "healthy" | "warning" | "critical" = "healthy";
  let overview: Awaited<ReturnType<typeof getServerOverview>> | null = null;
  let modules: Awaited<ReturnType<typeof getAllModuleStatuses>> = [];
  let alerts: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  let lastCheck: Date | null = null;
  let checkData: Record<string, Record<string, unknown>> = {};

  try {
    [globalStatus, overview, modules, alerts, lastCheck, checkData] =
      await Promise.all([
        getGlobalStatus(selectedServerId || undefined),
        getServerOverview(selectedServerId || undefined),
        getAllModuleStatuses(selectedServerId || undefined),
        getRecentAlerts(40, {
          serverId: selectedServerId || undefined,
        }),
        getLastCheckTime(selectedServerId || undefined),
        getLatestCheckDataByModule(selectedServerId || undefined),
      ]);
  } catch {
    /* empty */
  }

  const statusMap = rollupRelatedModuleStatuses(
    Object.fromEntries(modules.map((m) => [m.module, m.status])),
  );

  const fimAlertPaths = fimPathsFromAlerts(alerts);
  if (fimAlertPaths.length > 0 && statusMap.fim !== "critical") {
    statusMap.fim = "critical";
  }

  for (const mod of MONITOR_MODULE_ORDER) {
    if (!statusMap[mod]) statusMap[mod] = "unknown";
  }

  const moduleDetails: Record<string, string[]> = {};
  const moduleCheckedAt = Object.fromEntries(
    modules.map((m) => [m.module, m.at]),
  );
  for (const mod of MONITOR_MODULE_ORDER) {
    moduleDetails[mod] = formatModuleDetailLines(mod, checkData[mod], {
      status: statusMap[mod],
      checkedAt: moduleCheckedAt[mod] ?? null,
      metrics: overview?.metrics ?? null,
      compact: true,
      fimAlertPaths: mod === "fim" ? fimAlertPaths : undefined,
    });
  }

  const counts = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
  for (const mod of MONITOR_MODULE_ORDER) {
    const s = statusMap[mod] as keyof typeof counts;
    if (s in counts) counts[s]++;
  }

  // globalStatus bleibt aus getGlobalStatus (offene Alerts) — nicht aus Kachel-Subset überschreiben

  const placeholders = new Set<string>(MONITOR_PLACEHOLDER_MODULES);
  const liveAlerts = alerts.filter((a) => {
    if (a.level !== "warning" && a.level !== "critical") return false;
    if (placeholders.has(a.module)) return false;
    return true;
  });

  const levelRank = (level: string) =>
    level === "critical" ? 0 : level === "warning" ? 1 : 2;
  const ranked = [...liveAlerts].sort(
    (a, b) => levelRank(a.level) - levelRank(b.level),
  );
  const tickerAlerts: typeof liveAlerts = [];
  const seenModules = new Set<string>();
  for (const a of ranked) {
    if (seenModules.has(a.module)) continue;
    seenModules.add(a.module);
    tickerAlerts.push(a);
  }

  const sshHost = process.env.SSH_HOST;
  const hostIp =
    sshHost ?? overview?.server?.ipv4 ?? overview?.server?.host ?? "—";
  const hostLabel =
    sshHost && overview?.server?.name === "Primary Server"
      ? "Production"
      : (overview?.server?.name ?? "Server");

  const uptimeFormatted =
    overview?.metrics?.uptimeSeconds != null
      ? formatUptime(overview.metrics.uptimeSeconds)
      : "—";

  const metricCards = buildMonitorMetricCards(
    overview?.metrics ?? null,
    uptimeFormatted,
  );

  return (
    <MonitorAutoRefresh intervalSec={30}>
      <div className="px-4 pt-3 flex justify-end">
        <Suspense fallback={null}>
          <ServerSelect
            servers={serverRows.map((s) => ({
              id: s.id,
              name: s.name,
              host: s.host,
            }))}
            selectedId={selectedServerId}
          />
        </Suspense>
      </div>
      <MonitorTvProtection
        globalStatus={globalStatus}
        nightStartHour={getMonitorNightStartHour()}
        nightEndHour={getMonitorNightEndHour()}
        pixelShiftSec={getMonitorPixelShiftSec()}
        nightModeEnabled={isMonitorNightModeEnabled()}
      >
        <MonitorWall
          globalStatus={globalStatus}
          hostLabel={hostLabel}
          hostIp={hostIp}
          checkMode={overview?.checkMode ?? "mock"}
          lastCheck={lastCheck}
          metricCards={metricCards}
          statusMap={statusMap}
          moduleDetails={moduleDetails}
          counts={counts}
          alerts={tickerAlerts.map((a) => ({
            id: a.id,
            level: a.level,
            module: a.module,
            message: a.message,
          }))}
        />
      </MonitorTvProtection>
    </MonitorAutoRefresh>
  );
}
