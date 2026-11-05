import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  load1: number | null;
  load5: number | null;
  load15: number | null;
  cores: number | null;
  checkedAt?: Date | null;
};

const RINGS = [
  {
    key: "1",
    label: "1 min",
    stroke: "stroke-cyan-400",
    text: "text-cyan-300",
    dot: "bg-cyan-400",
  },
  {
    key: "5",
    label: "5 min",
    stroke: "stroke-sky-400",
    text: "text-sky-300",
    dot: "bg-sky-400",
  },
  {
    key: "15",
    label: "15 min",
    stroke: "stroke-emerald-400",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
  },
] as const;

function arcPath(cx: number, cy: number, r: number, pct: number): string {
  const p = Math.min(1, Math.max(0, pct));
  if (p <= 0) return "";
  const start = -Math.PI / 2;
  const end = start + p * 2 * Math.PI;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  if (p >= 0.999) {
    const mid = start + Math.PI;
    const xm = cx + r * Math.cos(mid);
    const ym = cy + r * Math.sin(mid);
    return `M ${x1} ${y1} A ${r} ${r} 0 1 1 ${xm} ${ym} A ${r} ${r} 0 1 1 ${x1} ${y1}`;
  }
  const large = p > 0.5 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

function formatLoad(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

/** Load 1/5/15 as HUD concentric rings — same visual family as monitor metrics. */
export function LoadAveragePanel({
  load1,
  load5,
  load15,
  cores,
  checkedAt,
}: Props) {
  const max = Math.max(cores && cores > 0 ? cores : 1, 1);
  const values = [load1, load5, load15];
  const radii = [78, 58, 38];
  const cx = 100;
  const cy = 100;

  return (
    <Card id="load" className="overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="tracking-wide">Load</CardTitle>
        {checkedAt && (
          <span className="text-xs text-zinc-600 font-mono">
            {checkedAt.toLocaleString("de-DE")}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {load1 == null && load5 == null && load15 == null ? (
          <p className="text-sm text-zinc-500">
            Noch kein Load-Sample — erscheint nach dem nächsten Server-Health-Lauf.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div className="relative">
              <svg
                viewBox="0 0 200 200"
                className="w-48 h-48 sm:w-56 sm:h-56 drop-shadow-[0_0_24px_rgba(34,211,238,0.15)]"
                role="img"
                aria-label={`Load ${formatLoad(load1)} / ${formatLoad(load5)} / ${formatLoad(load15)} · ${max} cores`}
              >
                {radii.map((r) => (
                  <circle
                    key={`bg-${r}`}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    className="stroke-white/10"
                    strokeWidth={11}
                  />
                ))}
                {RINGS.map((ring, i) => {
                  const v = values[i];
                  const pct =
                    v != null && Number.isFinite(v) ? v / max : 0;
                  const d = arcPath(cx, cy, radii[i]!, pct);
                  if (!d) return null;
                  return (
                    <path
                      key={ring.key}
                      d={d}
                      fill="none"
                      className={ring.stroke}
                      strokeWidth={11}
                      strokeLinecap="round"
                    />
                  );
                })}
                <circle
                  cx={cx}
                  cy={cy}
                  r={90}
                  fill="none"
                  stroke="rgb(34 211 238 / 12%)"
                  strokeWidth={1}
                  strokeDasharray="2 10"
                  className="motion-safe:animate-[spin_28s_linear_infinite]"
                  style={{ transformOrigin: "100px 100px" }}
                />
                <text
                  x={cx}
                  y={cy - 4}
                  textAnchor="middle"
                  fill="#ecfeff"
                  fontSize={26}
                  fontWeight={700}
                  fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                >
                  {formatLoad(load1)}
                </text>
                <text
                  x={cx}
                  y={cy + 18}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize={11}
                  letterSpacing="0.12em"
                  fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                >
                  {cores != null ? `${cores} CORES` : "LOAD"}
                </text>
              </svg>
            </div>

            <ul className="space-y-4 w-full max-w-xs">
              {RINGS.map((ring, i) => {
                const v = values[i];
                const pct =
                  v != null && Number.isFinite(v)
                    ? Math.min(100, Math.round((v / max) * 100))
                    : 0;
                return (
                  <li key={ring.key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-zinc-400 uppercase tracking-widest text-xs font-medium">
                        <span
                          className={cn("size-2 rounded-full", ring.dot)}
                          aria-hidden
                        />
                        {ring.label}
                      </span>
                      <span
                        className={cn(
                          "font-mono tabular-nums text-lg font-semibold",
                          ring.text,
                        )}
                      >
                        {formatLoad(v ?? null)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", ring.dot)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
