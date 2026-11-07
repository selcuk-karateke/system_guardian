import { MonitorAlertTicker } from "./monitor-alert-ticker";
import { MonitorGlobe } from "./monitor-globe";
import { MonitorMatrixRain } from "./monitor-matrix-rain";
import type { MonitorEgressInfo } from "./monitor-status-band";
import { MonitorCustomArea } from "./monitor-custom-area";
import {
  type MonitorModuleSection,
} from "./monitor-module-grid";
import type { ServerSelectOption } from "./server-select";
import type { GlobeTint } from "@/lib/geo/attack-markers";
import type {
  MetricToneThresholds,
  MonitorLiveHostVitals,
  MonitorMetricCards,
} from "@/lib/monitor-metric-cards";
import {
  crisisStageHeroLabel,
  crisisStageToWallTone,
  type CrisisStage,
} from "@/lib/crisis/stages";
import type { UiLayout } from "@/lib/ui-layout";
import { defaultUiLayout } from "@/lib/ui-layout";

/** Priority stages — most important first; dividers between stages while scrolling. */
const MODULE_SECTIONS: readonly MonitorModuleSection[] = [
  {
    id: "core",
    label: "1 · CORE",
    modules: [
      "server_health",
      "raid",
      "backups",
      "database",
      "docker",
      "coolify",
    ],
  },
  {
    id: "security",
    label: "2 · SECURITY",
    modules: [
      "logins",
      "ssh_keys",
      "fim",
      "scanner",
      "users",
      "security_posture",
      "network",
      "ports",
    ],
  },
  {
    id: "ops",
    label: "3 · OPS",
    modules: [
      "services",
      "processes",
      "logs",
      "ssl",
      "website",
      "trivy",
      "cron",
      "web_presence",
      "reserved",
      "reserved_b",
    ],
  },
];

type TileSeverity = CrisisStage | "ok" | "unknown";

type Props = {
  crisisStage: CrisisStage | null;
  hostLabel: string;
  hostIp: string;
  /** Short inventory line under host (hostname · kernel · upd) */
  hostMeta?: string | null;
  checkMode: string;
  lastCheck: Date | null;
  metricCards: MonitorMetricCards;
  severityMap: Record<string, TileSeverity>;
  moduleDetails: Record<string, string[]>;
  counts: { ok: number; s4: number; s3: number; s2: number; s1: number };
  alerts: { id: string; level: string; module: string; message: string }[];
  attackMarkers?: GlobeTint[];
  sessionMarkers?: GlobeTint[];
  webMarkers?: GlobeTint[];
  homeMarker?: GlobeTint | null;
  egress?: MonitorEgressInfo | null;
  /** Fresh agent host vitals for live metric cards (SSR seed). */
  liveHost?: MonitorLiveHostVitals | null;
  cpuCores?: number | null;
  /** Ampel thresholds from Settings (CPU/RAM/Disk). */
  toneThresholds?: MetricToneThresholds;
  serverId?: string | null;
  servers?: ServerSelectOption[];
  /** Per-user monitor layout (metrics + modules). */
  uiLayout?: UiLayout;
  canPersistLayout?: boolean;
};

export function MonitorWall({
  crisisStage,
  hostLabel,
  hostIp,
  hostMeta = null,
  checkMode,
  lastCheck,
  metricCards,
  severityMap,
  moduleDetails,
  counts,
  alerts,
  attackMarkers = [],
  sessionMarkers = [],
  webMarkers = [],
  homeMarker = null,
  egress = null,
  liveHost = null,
  cpuCores = null,
  toneThresholds,
  serverId = null,
  servers = [],
  uiLayout,
  canPersistLayout = false,
}: Props) {
  const wallTone = crisisStageToWallTone(crisisStage);
  const hero = crisisStageHeroLabel(crisisStage);
  const layout = uiLayout ?? defaultUiLayout();

  return (
    <div className="monitor-wall" data-status={wallTone}>
      {/* BG wash only — globe lives in .monitor-hud so bg opacity cannot dim it */}
      <div className="monitor-bg" aria-hidden>
        <div className="monitor-aurora" />
        <div className="monitor-waves monitor-waves--top">
          <div className="monitor-wave monitor-wave--flip" />
          <div className="monitor-wave monitor-wave--flip" />
          <div className="monitor-wave monitor-wave--flip" />
        </div>
        <div className="monitor-waves monitor-waves--mid">
          <div className="monitor-wave" />
          <div className="monitor-wave" />
          <div className="monitor-wave" />
          <div className="monitor-wave" />
        </div>
        <div className="monitor-waves monitor-waves--floor">
          <div className="monitor-wave" />
          <div className="monitor-wave" />
          <div className="monitor-wave" />
          <div className="monitor-wave" />
        </div>
      </div>
      <div className="monitor-hud" aria-hidden>
        <MonitorMatrixRain status={wallTone} />
        <div className="monitor-hud-grid" />
        <div className="monitor-hud-rings">
          <MonitorGlobe
            status={wallTone}
            attackMarkers={attackMarkers}
            sessionMarkers={sessionMarkers}
            webMarkers={webMarkers}
            homeMarker={homeMarker}
          />
          <div className="monitor-hud-ring monitor-hud-ring--1" />
          <div className="monitor-hud-ring monitor-hud-ring--2" />
          <div className="monitor-hud-ring monitor-hud-ring--3" />
        </div>
        <div className="monitor-hud-scan" />
      </div>

      <div className="monitor-content">
        <MonitorCustomArea
          initialLayout={layout}
          canPersist={canPersistLayout}
          catalogSections={MODULE_SECTIONS}
          wallTone={wallTone}
          crisisStage={crisisStage}
          hero={hero}
          counts={counts}
          lastCheck={lastCheck}
          serverId={serverId}
          servers={servers}
          hostLabel={hostLabel}
          hostIp={hostIp}
          hostMeta={hostMeta}
          checkMode={checkMode}
          initial={{ egress, host: liveHost }}
          metricCards={metricCards}
          cpuCores={cpuCores}
          toneThresholds={toneThresholds}
          severityMap={severityMap}
          moduleDetails={moduleDetails}
        />

        <footer className="monitor-glass monitor-bottom">
          <MonitorAlertTicker alerts={alerts} intervalMs={6000} />
        </footer>
      </div>
    </div>
  );
}
