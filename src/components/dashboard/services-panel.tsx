import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ServiceRow } from "@/lib/checks/services";
import { cn } from "@/lib/utils";

type Props = {
  rows: ServiceRow[] | null;
  failedUnits?: string[];
  status?: string | null;
  checkedAt?: Date | null;
};

function Pill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-mono uppercase tracking-wide border",
        on
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          : "border-zinc-700 bg-zinc-900/60 text-zinc-600",
      )}
    >
      {label}
    </span>
  );
}

export function ServicesPanel({
  rows,
  failedUnits = [],
  status,
  checkedAt,
}: Props) {
  return (
    <Card id="services">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="tracking-wide">Dienste</CardTitle>
        <div className="flex items-center gap-2">
          {checkedAt && (
            <span className="text-xs text-zinc-600 font-mono">
              {checkedAt.toLocaleString("de-DE")}
            </span>
          )}
          {status && (
            <Badge
              variant={
                status === "critical" ||
                status === "warning" ||
                status === "healthy"
                  ? (status as "healthy" | "warning" | "critical")
                  : "healthy"
              }
            >
              {status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!rows?.length ? (
          <p className="text-sm text-zinc-500">
            Noch kein Dienste-Check — erscheint nach dem nächsten
            Security-/Services-Lauf.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800/80 rounded-xl border border-zinc-800 overflow-hidden">
            {rows.map((row) => (
              <li
                key={row.unit}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-zinc-950/40",
                  row.required && !row.running && "bg-amber-950/25",
                )}
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-100">{row.label}</p>
                  <p className="font-mono text-[11px] text-zinc-600 mt-0.5">
                    {row.resolvedUnit ?? row.unit}
                    {row.required ? " · Pflicht" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill on={row.enabled} label="enabled" />
                  <Pill on={row.running} label="active" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {failedUnits.length > 0 && (
          <p className="mt-3 text-xs text-amber-400/90">
            Failed units: {failedUnits.slice(0, 8).join(", ")}
            {failedUnits.length > 8 ? ` (+${failedUnits.length - 8})` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
