import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DISK_TEMP_CRIT_C,
  DISK_TEMP_WARN_C,
  type DiskTemp,
} from "@/lib/checks/disk-storage";
import { cn } from "@/lib/utils";
import { HudRing, type HudTone } from "./hud-ring";

type Props = {
  disks: DiskTemp[] | null;
  checkedAt?: Date | null;
};

function tempTone(c: number | null): HudTone {
  if (c == null) return "ok";
  if (c >= DISK_TEMP_CRIT_C) return "crit";
  if (c >= DISK_TEMP_WARN_C) return "warn";
  return "ok";
}

/** Map °C into a soft ring fill (idle ~20°C → hot at warn). */
function tempPct(c: number | null): number {
  if (c == null) return 0;
  return Math.min(100, Math.max(0, Math.round(((c - 15) / 50) * 100)));
}

export function DiskTempsPanel({ disks, checkedAt }: Props) {
  return (
    <Card id="disk-temps">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="tracking-wide">Disk-Temp</CardTitle>
        {checkedAt && (
          <span className="text-xs text-zinc-600 font-mono">
            {checkedAt.toLocaleString("de-DE")}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {!disks?.length ? (
          <p className="text-sm text-zinc-500">
            Keine Disk-Temps — erscheint nach dem nächsten Server-Health-Lauf.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {disks.map((d) => {
              const tone = tempTone(d.celsius);
              return (
                <li
                  key={d.device}
                  className="flex items-center gap-3 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.03] px-3 py-3"
                >
                  <HudRing
                    pct={tempPct(d.celsius)}
                    tone={tone}
                    className="w-12 h-12"
                    tick={false}
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-zinc-500 truncate">
                      {d.path}
                    </p>
                    <p
                      className={cn(
                        "font-mono text-xl font-semibold tabular-nums tracking-tight",
                        tone === "crit" && "text-rose-400",
                        tone === "warn" && "text-amber-400",
                        tone === "ok" &&
                          (d.celsius != null
                            ? "text-zinc-100"
                            : "text-zinc-600"),
                      )}
                    >
                      {d.celsius != null ? `${d.celsius}°C` : "—"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
