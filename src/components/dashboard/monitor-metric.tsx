import { MonitorSparkline } from "./monitor-sparkline";

export type MetricCardProps = {
  label: string;
  value: number | null | undefined;
  displayValue?: string;
  unit?: string;
  lines?: string[];
  tone?: "ok" | "warn" | "crit";
  /** Soft sparkline backdrop (live history). */
  series?: number[];
  /** Pin sparkline Y domain (RAM/Disk = 0–100). */
  seriesDomain?: { min: number; max: number };
};

function MonitorRingGauge({
  pct,
  tone,
}: {
  pct: number;
  tone: "ok" | "warn" | "crit";
}) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, pct)) / 100) * c;

  return (
    <span className={`monitor-stat-ring-wrap monitor-stat-ring-wrap--${tone}`}>
      <svg
        className={`monitor-stat-ring monitor-stat-ring--${tone}`}
        viewBox="0 0 100 100"
        aria-hidden
      >
        {/* Soft bloom on the stroke path — not on the outer wrap */}
        <circle
          className={`monitor-stat-ring-glow monitor-stat-ring-glow--${tone}`}
          cx="50"
          cy="50"
          r={r}
        />
        <circle
          className={`monitor-stat-ring-track monitor-stat-ring-track--${tone}`}
          cx="50"
          cy="50"
          r={r}
        />
        <circle
          className={`monitor-stat-ring-fill monitor-stat-ring-fill--${tone}`}
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={`${filled} ${c}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
    </span>
  );
}

export function MonitorHeroMetric({
  label,
  value,
  unit = "%",
  displayValue,
  lines = [],
  tone = "ok",
  series,
  seriesDomain,
}: MetricCardProps) {
  const pct = value ?? 0;
  const showRing = value != null;
  const isTextValue = displayValue != null;
  const showSpark = series != null && series.length >= 2;

  return (
    <div
      className={`monitor-glass monitor-stat monitor-stat--hud monitor-stat--${tone}`}
    >
      {showSpark ? (
        <MonitorSparkline
          values={series}
          tone={tone}
          fixedDomain={seriesDomain}
        />
      ) : null}
      <div className="monitor-stat-head">
        <div className="monitor-stat-body">
          <span className="monitor-stat-label">{label}</span>
          <span
            className={`monitor-stat-value${isTextValue ? " monitor-stat-value--text" : ""}`}
          >
            {displayValue != null ? (
              displayValue
            ) : value != null ? (
              <>
                {value}
                <span className="monitor-stat-unit">{unit}</span>
              </>
            ) : (
              "—"
            )}
          </span>
          <div className="monitor-stat-details" aria-hidden={lines.length === 0}>
            {lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </div>
        {showRing ? <MonitorRingGauge pct={pct} tone={tone} /> : null}
      </div>
    </div>
  );
}
