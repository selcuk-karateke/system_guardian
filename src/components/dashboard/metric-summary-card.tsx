import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HudRing, toneFromPct, type HudTone } from "./hud-ring";

type Props = {
  label: string;
  value: number | null | undefined;
  unit?: string;
  lines?: string[];
  tone?: HudTone;
  href?: string;
};

/** Compact metric tile with monitor-style ring — for infrastructure overview. */
export function MetricSummaryCard({
  label,
  value,
  unit = "%",
  lines = [],
  tone,
  href,
}: Props) {
  const resolvedTone = tone ?? toneFromPct(value);
  const body = (
    <CardContent className="p-4 flex items-center gap-3">
      <HudRing
        pct={value ?? 0}
        tone={resolvedTone}
        className="w-16 h-16"
      />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-400 font-semibold">
          {label}
        </p>
        <p className="font-mono text-3xl font-bold tabular-nums text-zinc-50 leading-none mt-1">
          {value != null ? (
            <>
              {value}
              <span className="text-base text-zinc-500 ml-0.5">{unit}</span>
            </>
          ) : (
            "—"
          )}
        </p>
        {lines.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {lines.map((line) => (
              <p
                key={line}
                className="text-xs text-zinc-500 font-mono truncate"
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    </CardContent>
  );

  if (href) {
    return (
      <Card
        className={cn(
          "overflow-hidden transition-colors hover:border-cyan-400/30",
        )}
      >
        <a href={href} className="block focus:outline-none">
          {body}
        </a>
      </Card>
    );
  }

  return <Card className="overflow-hidden">{body}</Card>;
}
