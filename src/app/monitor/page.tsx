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
  getGlobalCrisisStage,
  getLastCheckTime,
  getRecentAlerts,
  getServerOverview,
} from "@/lib/dashboard-data";
import { fimPathsFromAlerts } from "@/lib/alerts/fim-paths";
import {
  buildMonitorMetricCards,
  formatModuleDetailLines,
  getLatestCheckDataByModule,
} from "@/lib/monitor-details";
import {
  compareCrisisAlerts,
  crisisStageForModule,
  crisisStageToWallTone,
  type CrisisStage,
} from "@/lib/crisis/stages";
import {
  formatInventoryShort,
  inventoryFromCheckData,
} from "@/lib/checks/host-inventory";
import { buildGlobeTints } from "@/lib/geo/attack-markers";
import { MONITOR_MODULE_ORDER, MONITOR_PLACEHOLDER_MODULES } from "@/lib/module-labels";
import { listActiveServers } from "@/lib/servers";
import { formatUptime } from "@/lib/utils";

type TileSeverity = CrisisStage | "ok" | "unknown";

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

  let crisisStage: CrisisStage | null = null;
  let overview: Awaited<ReturnType<typeof getServerOverview>> | null = null;
  let modules: Awaited<ReturnType<typeof getAllModuleStatuses>> = [];
  let alerts: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  let lastCheck: Date | null = null;
  let checkData: Record<string, Record<string, unknown>> = {};

  try {
    [crisisStage, overview, modules, alerts, lastCheck, checkData] =
      await Promise.all([
        getGlobalCrisisStage(selectedServerId || undefined),
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

  const checkStatusByModule = Object.fromEntries(
    modules.map((m) => [m.module, m.status]),
  );

  const placeholders = new Set<string>(MONITOR_PLACEHOLDER_MODULES);
  const liveAlerts = alerts.filter((a) => {
    if (a.level !== "warning" && a.level !== "critical") return false;
    if (placeholders.has(a.module)) return false;
    return true;
  });

  const severityMap: Record<string, TileSeverity> = {};
  for (const mod of MONITOR_MODULE_ORDER) {
    if (placeholders.has(mod)) {
      severityMap[mod] = "unknown";
      continue;
    }
    const related = mod === "docker" ? (["trivy"] as const) : [];
    const stage = crisisStageForModule(mod, liveAlerts, related);
    if (stage != null) {
      severityMap[mod] = stage;
    } else if (!checkStatusByModule[mod]) {
      severityMap[mod] = "unknown";
    } else {
      severityMap[mod] = "ok";
    }
  }

  // FIM path alerts already in liveAlerts; keep stage from alerts only.

  const moduleDetails: Record<string, string[]> = {};
  const moduleCheckedAt = Object.fromEntries(
    modules.map((m) => [m.module, m.at]),
  );
  for (const mod of MONITOR_MODULE_ORDER) {
    const sev = severityMap[mod];
    const legacyStatus =
      sev === "ok" || sev === "unknown"
        ? sev === "ok"
          ? "healthy"
          : "unknown"
        : sev <= 2
          ? "critical"
          : "warning";
    moduleDetails[mod] = formatModuleDetailLines(mod, checkData[mod], {
      status: legacyStatus,
      checkedAt: moduleCheckedAt[mod] ?? null,
      metrics: overview?.metrics ?? null,
      compact: true,
      fimAlertPaths:
        mod === "fim" ? fimPathsFromAlerts(alerts) : undefined,
    });
  }

  const counts = { ok: 0, s4: 0, s3: 0, s2: 0, s1: 0 };
  for (const mod of MONITOR_MODULE_ORDER) {
    if (placeholders.has(mod)) continue;
    const sev = severityMap[mod];
    if (sev === "ok") counts.ok += 1;
    else if (sev === 4) counts.s4 += 1;
    else if (sev === 3) counts.s3 += 1;
    else if (sev === 2) counts.s2 += 1;
    else if (sev === 1) counts.s1 += 1;
  }

  const tickerDeduped = [];
  const seenModules = new Set<string>();
  for (const a of [...liveAlerts].sort(compareCrisisAlerts)) {
    if (seenModules.has(a.module)) continue;
    seenModules.add(a.module);
    tickerDeduped.push(a);
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

  const inventory = inventoryFromCheckData(checkData.server_health ?? null);
  const hostMeta = inventory ? formatInventoryShort(inventory) : null;

  const metricCards = buildMonitorMetricCards(
    overview?.metrics ?? null,
    uptimeFormatted,
    {
      kernel: inventory?.kernel,
      osPretty: inventory?.osPretty,
    },
  );

  const egressSrc =
    checkData.server_health ?? checkData.network ?? undefined;
  const egress =
    egressSrc && typeof egressSrc.egressTxMbps === "number"
      ? {
          txMbps: egressSrc.egressTxMbps as number,
          txBytes:
            typeof egressSrc.egressTxBytes === "number"
              ? (egressSrc.egressTxBytes as number)
              : undefined,
          windowSec:
            typeof egressSrc.egressWindowSec === "number"
              ? (egressSrc.egressWindowSec as number)
              : undefined,
          iface:
            typeof egressSrc.egressIface === "string"
              ? (egressSrc.egressIface as string)
              : null,
          topTalker:
            typeof egressSrc.topTalker === "string"
              ? (egressSrc.topTalker as string)
              : null,
        }
      : null;

  const homeIpCandidate =
    overview?.server?.ipv4 ??
    (sshHost && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(sshHost) ? sshHost : null);

  const {
    attacks: attackMarkers,
    sessions: sessionMarkers,
    web: webMarkers,
    home: homeMarker,
  } = await buildGlobeTints(checkData, { homeIp: homeIpCandidate });

  const wallTone = crisisStageToWallTone(crisisStage);

  return (
    <MonitorAutoRefresh intervalSec={60}>
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
        globalStatus={wallTone}
        crisisStage={crisisStage}
        nightStartHour={getMonitorNightStartHour()}
        nightEndHour={getMonitorNightEndHour()}
        pixelShiftSec={getMonitorPixelShiftSec()}
        nightModeEnabled={isMonitorNightModeEnabled()}
      >
        <MonitorWall
          crisisStage={crisisStage}
          hostLabel={hostLabel}
          hostIp={hostIp}
          hostMeta={hostMeta}
          checkMode={overview?.checkMode ?? "mock"}
          lastCheck={lastCheck}
          metricCards={metricCards}
          severityMap={severityMap}
          moduleDetails={moduleDetails}
          counts={counts}
          alerts={tickerDeduped.map((a) => ({
            id: a.id,
            level: a.level,
            module: a.module,
            message: a.message,
          }))}
          attackMarkers={attackMarkers}
          sessionMarkers={sessionMarkers}
          webMarkers={webMarkers}
          homeMarker={homeMarker}
          egress={egress}
          serverId={selectedServerId}
        />
      </MonitorTvProtection>
    </MonitorAutoRefresh>
  );
}
