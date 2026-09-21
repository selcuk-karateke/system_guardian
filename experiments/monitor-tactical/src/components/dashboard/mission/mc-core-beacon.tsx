import type { WallboardData } from "@/lib/monitor-wallboard";

const STATUS_RING = {
  healthy: "ok",
  warning: "warn",
  critical: "crit",
} as const;

export function McCoreBeacon({ data }: { data: WallboardData }) {
  const ring = STATUS_RING[data.globalStatus];

  return (
    <div
      className={`mc-beacon mc-beacon--${ring}`}
      aria-label={`System ${data.globalStatus}`}
      data-status={data.globalStatus}
    >
      <div className="mc-beacon-ring" aria-hidden>
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" className="mc-beacon-track" />
          <circle
            cx="60"
            cy="60"
            r="52"
            className="mc-beacon-fill"
            strokeDasharray={327}
            strokeDashoffset={327 - (data.healthScore / 100) * 327}
          />
        </svg>
        <span className="mc-beacon-pct" aria-hidden>
          {data.healthScore}
        </span>
      </div>
      <div className="mc-beacon-dots" aria-hidden>
        <span
          className="mc-beacon-dot mc-beacon-dot--ok"
          style={{ opacity: Math.min(1, data.counts.healthy / 10) }}
        />
        <span
          className="mc-beacon-dot mc-beacon-dot--warn"
          style={{
            opacity: data.counts.warning > 0 ? 1 : 0.25,
            transform: `scale(${1 + data.counts.warning * 0.15})`,
          }}
        />
        <span
          className="mc-beacon-dot mc-beacon-dot--crit"
          style={{
            opacity: data.counts.critical > 0 ? 1 : 0.2,
            transform: `scale(${1 + data.counts.critical * 0.25})`,
          }}
        />
      </div>
    </div>
  );
}
