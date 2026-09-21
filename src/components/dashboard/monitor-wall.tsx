import Link from "next/link";
import { MonitorAlertTicker } from "./monitor-alert-ticker";
import { MonitorClock } from "./monitor-clock";
import { MonitorHeroMetric } from "./monitor-metric";
import { MonitorReloadButton } from "./monitor-reload-button";
import { MonitorTile } from "./monitor-tile";
import type { MonitorMetricCards } from "@/lib/monitor-details";

const COLUMNS = [
  {
    modules: [
      "server_health",
      "raid",
      "backups",
      "ports",
      "logs",
      "network",
    ],
  },
  {
    modules: ["docker", "coolify", "database", "ssl", "website", "cron"],
  },
  {
    modules: ["fim", "ssh_keys", "users", "logins", "scanner", "reserved"],
  },
] as const;

type Props = {
  globalStatus: "healthy" | "warning" | "critical";
  hostLabel: string;
  hostIp: string;
  checkMode: string;
  lastCheck: Date | null;
  metricCards: MonitorMetricCards;
  statusMap: Record<string, string>;
  moduleDetails: Record<string, string[]>;
  counts: { healthy: number; warning: number; critical: number; unknown: number };
  alerts: { id: string; level: string; module: string; message: string }[];
};

const STATUS_DISPLAY = {
  healthy: "HEALTHY",
  warning: "WARNING",
  critical: "CRITICAL",
} as const;

export function MonitorWall({
  globalStatus,
  hostLabel,
  hostIp,
  checkMode,
  lastCheck,
  metricCards,
  statusMap,
  moduleDetails,
  counts,
  alerts,
}: Props) {
  const tickerAlerts = alerts.filter(
    (a) => a.level === "critical" || a.level === "warning",
  );

  return (
    <div className="monitor-wall" data-status={globalStatus}>
      <div className="monitor-bg" aria-hidden>
        <div className="monitor-hud">
          <div className="monitor-hud-grid" />
          <div className="monitor-hud-rings">
            <div className="monitor-hud-ring monitor-hud-ring--1" />
            <div className="monitor-hud-ring monitor-hud-ring--2" />
            <div className="monitor-hud-ring monitor-hud-ring--3" />
          </div>
          <div className="monitor-hud-scan" />
        </div>
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
            <MonitorClock />
            <MonitorReloadButton />
            <Link href="/" className="monitor-top-link">
              Dashboard
            </Link>
          </div>
        </header>

        <section
          className={`monitor-glass monitor-status-band monitor-status-band--${globalStatus}`}
        >
          <div className="monitor-status-main">
            <p className={`monitor-display monitor-display--${globalStatus}`}>
              {STATUS_DISPLAY[globalStatus]}
            </p>
          </div>
          <div className="monitor-status-side">
            <div className="monitor-badges">
              <span className="monitor-badge monitor-badge--ok">
                {counts.healthy} OK
              </span>
              <span className="monitor-badge monitor-badge--warn">
                {counts.warning} Warn
              </span>
              <span className="monitor-badge monitor-badge--crit">
                {counts.critical} Crit
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
                  status={statusMap[mod] ?? "unknown"}
                  details={moduleDetails[mod]}
                />
              ))}
            </div>
          ))}
        </main>

        <footer className="monitor-glass monitor-bottom">
          <MonitorAlertTicker alerts={tickerAlerts} intervalMs={3000} />
        </footer>
      </div>
    </div>
  );
}
