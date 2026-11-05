import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DfMount } from "@/lib/checks/disk-storage";
import { cn } from "@/lib/utils";
import { HudRing, toneFromPct } from "./hud-ring";

type Props = {
  mounts: DfMount[] | null;
  checkedAt?: Date | null;
};

function barTone(pct: number): string {
  if (pct >= 90) return "bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.35)]";
  if (pct >= 80) return "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]";
  return "bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.35)]";
}

export function FilesystemsPanel({ mounts, checkedAt }: Props) {
  return (
    <Card id="filesystems">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="tracking-wide">Mounts</CardTitle>
        {checkedAt && (
          <span className="text-xs text-zinc-600 font-mono">
            {checkedAt.toLocaleString("de-DE")}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {!mounts?.length ? (
          <p className="text-sm text-zinc-500">
            Noch kein Server-Health-Check — Mounts erscheinen nach dem nächsten
            Lauf.
          </p>
        ) : (
          <ul className="space-y-5">
            {mounts.map((m) => {
              const tone = toneFromPct(m.usePercent, 80, 90);
              return (
                <li
                  key={`${m.filesystem}:${m.mountedOn}`}
                  className="flex items-center gap-4"
                >
                  <HudRing
                    pct={m.usePercent}
                    tone={tone}
                    className="w-14 h-14"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-sm text-zinc-100">
                        {m.filesystem}
                      </span>
                      <span className="font-mono text-xs text-cyan-400/80 tracking-wide">
                        {m.usePercent}%
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 font-mono">
                      {m.mountedOn} · {m.used} / {m.size} · frei {m.avail}
                    </p>
                    <div className="h-1.5 rounded-full bg-zinc-800/90 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", barTone(m.usePercent))}
                        style={{
                          width: `${Math.min(100, Math.max(0, m.usePercent))}%`,
                        }}
                      />
                    </div>
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
