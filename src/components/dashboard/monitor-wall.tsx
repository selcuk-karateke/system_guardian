import Link from "next/link";
import { MonitorAlertTicker } from "./monitor-alert-ticker";
import { MonitorClock } from "./monitor-clock";
import { MonitorGlobe } from "./monitor-globe";
import { MonitorHeroMetric } from "./monitor-metric";
import { MonitorModeSwitch } from "./monitor-mode-switch";
import { MonitorReloadButton } from "./monitor-reload-button";
import {
  MonitorStatusBand,
  type MonitorEgressInfo,
} from "./monitor-status-band";
import {
  MonitorModuleGrid,
  type MonitorModuleSection,
} from "./monitor-module-grid";
import type { GlobeTint } from "@/lib/geo/attack-markers";
import type { MonitorMetricCards } from "@/lib/monitor-details";
import {
  crisisStageHeroLabel,
  crisisStageToWallTone,
  type CrisisStage,
} from "@/lib/crisis/stages";

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
}: Props) {
  const wallTone = crisisStageToWallTone(crisisStage);
  const hero = crisisStageHeroLabel(crisisStage);

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
        <header className="monitor-top">
          <div>
            <div className="monitor-brand">
              <strong>System Guardian</strong>
              {checkMode === "ssh" ? " · LIVE" : ""}
            </div>
            <div className="monitor-host">
              {hostLabel} — {hostIp}
            </div>
            {hostMeta ? (
              <div className="monitor-host-meta">{hostMeta}</div>
            ) : null}
          </div>
          <div className="monitor-top-right">
            <MonitorModeSwitch compact />
            <MonitorClock />
            <MonitorReloadButton />
            <Link href="/" className="monitor-top-link">
              Dashboard
            </Link>
          </div>
        </header>

        <MonitorStatusBand
          wallTone={wallTone}
          crisisStage={crisisStage}
          hero={hero}
          counts={counts}
          lastCheck={lastCheck}
          egress={egress}
        />

        <section className="monitor-metrics">
          <MonitorHeroMetric
            label="Load"
            value={metricCards.cpu.value}
            displayValue={metricCards.cpu.displayValue ?? undefined}
            lines={metricCards.cpu.lines}
            tone={metricCards.cpu.tone}
          />
          <MonitorHeroMetric
            label="RAM"
            value={metricCards.ram.value}
            lines={metricCards.ram.lines}
            tone={metricCards.ram.tone}
          />
          <MonitorHeroMetric
            label="Disk"
            value={metricCards.disk.value}
            lines={metricCards.disk.lines}
            tone={metricCards.disk.tone}
          />
          <MonitorHeroMetric
            label="Uptime"
            value={null}
            displayValue={metricCards.uptime.display}
            lines={metricCards.uptime.lines}
          />
        </section>

        <MonitorModuleGrid
          sections={MODULE_SECTIONS}
          severityMap={severityMap}
          moduleDetails={moduleDetails}
          visibleRows={4}
          secondsPerRow={3.5}
        />

        <footer className="monitor-glass monitor-bottom">
          <MonitorAlertTicker alerts={alerts} intervalMs={6000} />
        </footer>
      </div>
    </div>
  );
}
