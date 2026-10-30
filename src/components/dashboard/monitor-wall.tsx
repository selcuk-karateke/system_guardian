import Link from "next/link";
import { MonitorAlertTicker } from "./monitor-alert-ticker";
import { MonitorClock } from "./monitor-clock";
import { MonitorGlobe } from "./monitor-globe";
import { MonitorHeroMetric } from "./monitor-metric";
import { MonitorModeSwitch } from "./monitor-mode-switch";
import { MonitorReloadButton } from "./monitor-reload-button";
import { MonitorTile } from "./monitor-tile";
import type { GlobeTint } from "@/lib/geo/attack-markers";
import type { MonitorMetricCards } from "@/lib/monitor-details";
import {
  CRISIS_STAGE_META,
  crisisStageHeroLabel,
  crisisStageToWallTone,
  type CrisisStage,
} from "@/lib/crisis/stages";

const COLUMNS = [
  {
    modules: [
      "server_health",
      "raid",
      "backups",
      "ports",
      "logs",
      "network",
      "processes",
      "services",
    ],
  },
  {
    modules: [
      "docker",
      "trivy",
      "coolify",
      "database",
      "ssl",
      "website",
      "cron",
      "web_presence",
    ],
  },
  {
    modules: [
      "fim",
      "ssh_keys",
      "users",
      "logins",
      "scanner",
      "security_posture",
      "reserved",
      "reserved_b",
    ],
  },
] as const;

type TileSeverity = CrisisStage | "ok" | "unknown";

type Props = {
  crisisStage: CrisisStage | null;
  hostLabel: string;
  hostIp: string;
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
};

export function MonitorWall({
  crisisStage,
  hostLabel,
  hostIp,
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

        <section
          className={`monitor-glass monitor-status-band monitor-status-band--${wallTone}`}
        >
          <div className="monitor-status-main">
            <p className={`monitor-display monitor-display--${wallTone}`}>
              {hero}
            </p>
            {crisisStage != null && (
              <p className="monitor-status-sub">
                {CRISIS_STAGE_META[crisisStage].blurb}
              </p>
            )}
          </div>
          <div className="monitor-status-side">
            <div className="monitor-badges">
              <span className="monitor-badge monitor-badge--ok">
                {counts.ok} OK
              </span>
              <span className="monitor-badge monitor-badge--warn">
                {counts.s4 + counts.s3} S3–4
              </span>
              <span className="monitor-badge monitor-badge--crit">
                {counts.s2 + counts.s1} S1–2
              </span>
            </div>
            <p className="monitor-status-meta">
              {lastCheck ? lastCheck.toLocaleString("en-US") : "—"} · 30s
            </p>
          </div>
        </section>

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

        <main className="monitor-grid">
          {COLUMNS.map((col, i) => (
            <div
              key={i}
              className={`monitor-col monitor-col--${col.modules.length}`}
            >
              {col.modules.map((mod) => (
                <MonitorTile
                  key={mod}
                  module={mod}
                  severity={severityMap[mod] ?? "unknown"}
                  details={moduleDetails[mod]}
                />
              ))}
            </div>
          ))}
        </main>

        <footer className="monitor-glass monitor-bottom">
          <MonitorAlertTicker alerts={alerts} intervalMs={3000} />
        </footer>
      </div>
    </div>
  );
}
