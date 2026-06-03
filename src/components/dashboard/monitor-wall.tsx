import Link from "next/link";
import { MonitorClock } from "./monitor-clock";
import { MonitorHeroMetric } from "./monitor-metric";
import { MonitorTile } from "./monitor-tile";
import { MODULE_LABELS } from "@/lib/module-labels";
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
    modules: ["fim", "ssh_keys", "users", "logins", "scanner"],
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
  const topAlert = alerts.find((a) => a.level === "critical") ?? alerts[0];

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

        <footer
          className={`monitor-glass monitor-bottom ${
            topAlert?.level === "critical"
              ? "monitor-bottom--critical"
              : topAlert?.level === "warning"
                ? "monitor-bottom--warning"
                : ""
          }`}
        >
          {topAlert ? (
            <Link href={`/alerts/${topAlert.id}`} className="monitor-bottom-link">
              <span className="monitor-bottom-label">
                {topAlert.level === "critical" ? "Critical" : "Warning"}
              </span>
              {MODULE_LABELS[topAlert.module] ?? topAlert.module} — {topAlert.message}
            </Link>
          ) : (
            <span className="monitor-bottom-empty">No open alerts</span>
          )}
        </footer>
      </div>
    </div>
  );
}
