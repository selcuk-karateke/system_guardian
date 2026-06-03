import { MonitorAutoRefresh } from "@/components/dashboard/monitor-auto-refresh";
import { MonitorTvProtection } from "@/components/dashboard/monitor-tv-protection";
import { MonitorWall } from "@/components/dashboard/monitor-wall";
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
} from "@/lib/dashboard-data";
import {
  buildMonitorMetricCards,
  formatModuleDetailLines,
  getLatestCheckDataByModule,
} from "@/lib/monitor-details";
import { MONITOR_MODULE_ORDER } from "@/lib/module-labels";
import { formatUptime } from "@/lib/utils";

export default async function MonitorPage() {
  let globalStatus: "healthy" | "warning" | "critical" = "healthy";
  let overview: Awaited<ReturnType<typeof getServerOverview>> | null = null;
  let modules: Awaited<ReturnType<typeof getAllModuleStatuses>> = [];
  let alerts: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  let lastCheck: Date | null = null;
  let checkData: Record<string, Record<string, unknown>> = {};

  try {
    [globalStatus, overview, modules, alerts, lastCheck, checkData] =
      await Promise.all([
        getGlobalStatus(),
        getServerOverview(),
        getAllModuleStatuses(),
        getRecentAlerts(12),
        getLastCheckTime(),
        getLatestCheckDataByModule(),
      ]);
  } catch {
    /* empty */
  }

  const statusMap = Object.fromEntries(
    modules.map((m) => [m.module, m.status]),
  );

  for (const mod of MONITOR_MODULE_ORDER) {
    if (!statusMap[mod]) statusMap[mod] = "unknown";
  }

  const moduleDetails: Record<string, string[]> = {};
  const moduleCheckedAt = Object.fromEntries(modules.map((m) => [m.module, m.at]));
  for (const mod of MONITOR_MODULE_ORDER) {
    moduleDetails[mod] = formatModuleDetailLines(mod, checkData[mod], {
      status: statusMap[mod],
      checkedAt: moduleCheckedAt[mod] ?? null,
      metrics: overview?.metrics ?? null,
    });
  }

  const counts = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
  for (const mod of MONITOR_MODULE_ORDER) {
    const s = statusMap[mod] as keyof typeof counts;
    if (s in counts) counts[s]++;
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
        alerts={alerts.map((a) => ({
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
