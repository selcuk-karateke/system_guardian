import { Suspense } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HistoryFilters } from "@/components/history/history-filters";
import {
  getAlertsInRange,
  getChangeEventsInRange,
  getCheckRunsInRange,
  getPointInTimeChecks,
} from "@/lib/history/timeline";
import { getLatestCheckByModule } from "@/lib/dashboard-data";
import { buildCoolifyLookup, enrichDockerChangeKey } from "@/lib/docker-display";

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function parseRange(searchParams: {
  from?: string;
  to?: string;
  module?: string;
  tab?: string;
}) {
  const to = searchParams.to ? new Date(searchParams.to) : new Date();
  const from = searchParams.from
    ? new Date(searchParams.from)
    : new Date(to.getTime() - 7 * 86400000);
  return {
    from,
    to,
    module: searchParams.module || undefined,
    tab: searchParams.tab ?? "timeline",
  };
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    module?: string;
    tab?: string;
  }>;
}) {
  const sp = await searchParams;
  const range = parseRange(sp);
  const filters = { from: range.from, to: range.to, module: range.module };

  const dockerCheck = await getLatestCheckByModule("docker");
  const coolifyLookup = buildCoolifyLookup(
    (dockerCheck?.data as { containers?: { Names: string; coolify?: object }[] })
      ?.containers as Parameters<typeof buildCoolifyLookup>[0],
  );

  const [runs, changes, alertRows, pointInTime] = await Promise.all([
    getCheckRunsInRange(filters),
    range.tab === "changes" || range.tab === "timeline"
      ? getChangeEventsInRange(filters)
      : Promise.resolve([]),
    getAlertsInRange(filters),
    range.tab === "point"
      ? getPointInTimeChecks(range.to)
      : Promise.resolve([]),
  ]);

  const defaultFrom = toDatetimeLocal(range.from);
  const defaultTo = toDatetimeLocal(range.to);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Historie & Zeitfilter</h1>
        <p className="text-zinc-400 mt-2 text-sm max-w-3xl">
          Gespeicherte Check-Läufe, Änderungen und Alerts aus der Datenbank — für
          Früherkennung und „was war um Zeitpunkt X?“. Laufende Checks nutzen ein{" "}
          <Link href="/settings" className="text-sky-400 underline">
            rollierendes Beobachtungsfenster
          </Link>{" "}
          (Standard 24h).
        </p>
      </div>

      <Suspense fallback={<p className="text-zinc-500 text-sm">Filter …</p>}>
        <HistoryFilters defaultFrom={defaultFrom} defaultTo={defaultTo} />
      </Suspense>

      <p className="text-xs text-zinc-500">
        Anzeige: {range.from.toISOString()} — {range.to.toISOString()}
        {range.module ? ` · Modul ${range.module}` : ""}
      </p>

      {range.tab === "point" && (
        <Card>
          <CardHeader>
            <CardTitle>Point-in-time (letzter Check pro Modul ≤ Bis)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {pointInTime.length === 0 ? (
              <p className="text-zinc-500">Keine Daten vor diesem Zeitpunkt.</p>
            ) : (
              pointInTime.map((r) => (
                <div
                  key={r.id}
                  className="flex justify-between border-b border-zinc-800 py-2"
                >
                  <span className="font-mono text-zinc-300">{r.module}</span>
                  <span
                    className={
                      r.status === "critical"
                        ? "text-red-400"
                        : r.status === "warning"
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }
                  >
                    {r.status}
                  </span>
                  <span className="text-zinc-500 text-xs">
                    {r.createdAt.toISOString()}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {range.tab !== "point" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Check-Läufe ({runs.length})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 overflow-auto text-sm space-y-2">
              {runs.length === 0 ? (
                <p className="text-zinc-500">Keine Checks in diesem Fenster.</p>
              ) : (
                runs.map((r) => (
                  <div
                    key={r.id}
                    className="border-b border-zinc-800 py-2 flex flex-wrap gap-3"
                  >
                    <span className="text-zinc-500 text-xs shrink-0">
                      {r.createdAt.toISOString()}
                    </span>
                    <span className="font-mono">{r.module}</span>
                    <span
                      className={
                        r.status === "critical"
                          ? "text-red-400"
                          : r.status === "warning"
                            ? "text-amber-400"
                            : "text-emerald-400"
                      }
                    >
                      {r.status}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Änderungen ({changes.length})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 overflow-auto text-sm space-y-2">
              {changes.length === 0 ? (
                <p className="text-zinc-500">Keine Diff-Events.</p>
              ) : (
                changes.map((c) => (
                  <div key={c.id} className="border-b border-zinc-800 py-2">
                    <span className="text-zinc-500 text-xs">
                      {c.createdAt.toISOString()}
                    </span>{" "}
                    <span className="text-amber-400">{c.changeType}</span>{" "}
                    <span className="text-zinc-300">
                      {c.category}/
                      {enrichDockerChangeKey(c.category, c.entityKey, coolifyLookup)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Alerts ({alertRows.length})</CardTitle>
        </CardHeader>
        <CardContent className="max-h-80 overflow-auto text-sm space-y-2">
          {alertRows.length === 0 ? (
            <p className="text-zinc-500">Keine Alerts im Fenster.</p>
          ) : (
            alertRows.map((a) => (
              <div key={a.id} className="border-b border-zinc-800 py-2">
                <span className="text-zinc-500 text-xs">
                  {a.createdAt.toISOString()}
                </span>{" "}
                <span
                  className={
                    a.level === "critical" ? "text-red-400" : "text-amber-400"
                  }
                >
                  [{a.level}]
                </span>{" "}
                <span className="text-zinc-300">{a.message}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
