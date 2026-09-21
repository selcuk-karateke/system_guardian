import { MonitorAutoRefresh } from "@/components/dashboard/monitor-auto-refresh";
import { MonitorTvProtection } from "@/components/dashboard/monitor-tv-protection";
import { MonitorMissionWall } from "@/components/dashboard/mission/monitor-mission-wall";
import {
  getMonitorNightEndHour,
  getMonitorNightStartHour,
  getMonitorPixelShiftSec,
  isMonitorNightModeEnabled,
} from "@/lib/config";
import {
  getAllModuleStatuses,
  getChangeEvents,
  getLastCheckTime,
  getRecentAlerts,
  getServerOverview,
} from "@/lib/dashboard-data";
import { getLatestCheckDataByModule } from "@/lib/monitor-details";
import { buildWallboardData } from "@/lib/monitor-wallboard";
import { MONITOR_MODULE_ORDER } from "@/lib/module-labels";
import { formatUptime } from "@/lib/utils";

export default async function MonitorPage() {
  let overview: Awaited<ReturnType<typeof getServerOverview>> | null = null;
  let modules: Awaited<ReturnType<typeof getAllModuleStatuses>> = [];
  let alerts: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  let changeEvents: Awaited<ReturnType<typeof getChangeEvents>> = [];
  let lastCheck: Date | null = null;
  let checkData: Record<string, Record<string, unknown>> = {};

  try {
    [overview, modules, alerts, changeEvents, lastCheck, checkData] =
      await Promise.all([
        getServerOverview(),
        getAllModuleStatuses(),
        getRecentAlerts(15),
        getChangeEvents(12),
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

  const wallboard = buildWallboardData({
    statusMap,
    checkData,
    metrics: overview?.metrics ?? null,
    alerts: alerts.map((a) => ({
      id: a.id,
      level: a.level,
      module: a.module,
      message: a.message,
      createdAt: a.createdAt,
    })),
    changeEvents: changeEvents.map((e) => ({
      id: e.id,
      category: e.category,
      changeType: e.changeType,
      entityKey: e.entityKey,
      createdAt: e.createdAt,
    })),
    hostIp,
    uptimeLabel: uptimeFormatted,
  });

  return (
    <MonitorAutoRefresh intervalSec={30}>
      <MonitorTvProtection
        globalStatus={wallboard.globalStatus}
        nightStartHour={getMonitorNightStartHour()}
        nightEndHour={getMonitorNightEndHour()}
        pixelShiftSec={getMonitorPixelShiftSec()}
        nightModeEnabled={isMonitorNightModeEnabled()}
      >
        <MonitorMissionWall
          data={wallboard}
          hostLabel={hostLabel}
          hostIp={hostIp}
          checkMode={overview?.checkMode ?? "mock"}
        />
      </MonitorTvProtection>
    </MonitorAutoRefresh>
  );
}
