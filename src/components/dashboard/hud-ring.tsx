import { cn } from "@/lib/utils";

export type HudTone = "ok" | "warn" | "crit";

type Props = {
  /** 0–100 */
  pct: number;
  tone?: HudTone;
  className?: string;
  /** Outer tick ring (monitor screensaver look) */
  tick?: boolean;
};

/** Same ring language as `/monitor` hero metrics — reusable outside the TV wall. */
export function HudRing({
  pct,
  tone = "ok",
  className,
  tick = true,
}: Props) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, pct)) / 100) * c;

  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 100 100"
      aria-hidden
    >
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="rgb(255 255 255 / 8%)"
        strokeWidth={5}
      />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c}`}
        transform="rotate(-90 50 50)"
        className={cn(
          tone === "crit" && "stroke-rose-400",
          tone === "warn" && "stroke-amber-400",
          tone === "ok" && "stroke-emerald-400",
        )}
      />
      {tick && (
        <circle
          cx="50"
          cy="50"
          r={r + 6}
          fill="none"
          stroke="rgb(34 211 238 / 14%)"
          strokeWidth={1}
          strokeDasharray="2 8"
          style={{ transformOrigin: "50px 50px" }}
          className="motion-safe:animate-[spin_24s_linear_infinite]"
        />
      )}
    </svg>
  );
}

export function toneFromPct(
  pct: number | null | undefined,
  warn = 80,
  crit = 95,
): HudTone {
  if (pct == null) return "ok";
  if (pct >= crit) return "crit";
  if (pct >= warn) return "warn";
  return "ok";
}
