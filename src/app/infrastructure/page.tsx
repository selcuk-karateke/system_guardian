import { Suspense } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServerSelect } from "@/components/dashboard/server-select";
import {
  getLatestCheckByModule,
  getServerOverview,
} from "@/lib/dashboard-data";
import { listActiveServers } from "@/lib/servers";

export default async function InfrastructurePage({
  searchParams,
}: {
  searchParams: Promise<{ server?: string }>;
}) {
  const sp = await searchParams;
  const serverRows = await listActiveServers().catch(() => []);
  const selectedServerId =
    serverRows.find((s) => s.id === sp.server)?.id ??
    serverRows[0]?.id ??
    "";

  let overview: Awaited<ReturnType<typeof getServerOverview>> | null = null;
  let raid: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;
  let error: string | null = null;

  try {
    if (selectedServerId) {
      overview = await getServerOverview(selectedServerId);
      raid = await getLatestCheckByModule("raid", selectedServerId);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "DB error";
  }

  const m = overview?.metrics;
  const selected = serverRows.find((s) => s.id === selectedServerId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Infrastruktur</h1>
          <p className="text-sm text-zinc-500 mt-1">
            CPU, RAM, Disk und RAID für{" "}
            <strong className="text-zinc-300">einen</strong> Host — Server oben
            wählen. Übersicht aller Hosts:{" "}
            <Link href="/" className="sg-link hover:underline">
              Dashboard
            </Link>
            .
          </p>
        </div>
        {serverRows.length > 0 && (
          <Suspense fallback={null}>
            <ServerSelect
              servers={serverRows.map((s) => ({
                id: s.id,
                name: s.name,
                host: s.host,
              }))}
              selectedId={selectedServerId}
            />
          </Suspense>
        )}
      </div>

      {selected && (
        <p className="text-xs text-zinc-500 font-mono">
          Aktiv: {selected.name} · {selected.ipv4 ?? selected.host}
          {" · "}
          <Link
            href={`/servers/${selected.id}`}
            className="sg-link hover:underline"
          >
            Detailseite →
          </Link>
        </p>
      )}

      {error && <p className="text-amber-400">{error}</p>}

      {serverRows.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-zinc-500">
            Kein Server angelegt.{" "}
            <Link href="/settings#servers" className="sg-link hover:underline">
              Einstellungen → Server
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="sg-stagger grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>CPU / Load</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{m?.cpuPercent ?? "—"}%</p>
            <p className="text-sm text-zinc-500 mt-1">
              Load: {m?.loadAvg1} / {m?.loadAvg5} / {m?.loadAvg15}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>RAM / Swap</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{m?.ramPercent ?? "—"}%</p>
            <p className="text-sm text-zinc-500">Swap: {m?.swapPercent ?? 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{m?.diskPercent ?? "—"}%</p>
            {m?.temperatureCelsius && (
              <p className="text-sm text-zinc-500">
                Temp: {m.temperatureCelsius}°C
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>RAID</CardTitle>
          {raid && (
            <Badge
              variant={
                raid.status as "healthy" | "warning" | "critical"
              }
            >
              {raid.status}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {(raid?.data as { configured?: boolean })?.configured === false ? (
            <p className="text-sm text-zinc-400">
              {(raid?.data as { summary?: string })?.summary ??
                "Kein Linux Software-RAID erkannt (/proc/mdstat leer). Das ist normal, wenn du nur Hetzner-RAID oder normale SSDs ohne mdadm nutzt."}
            </p>
          ) : (raid?.data as { skipped?: boolean })?.skipped ? (
            <p className="text-sm text-zinc-500">
              RAID-Check in den Einstellungen deaktiviert.
            </p>
          ) : (
            <pre className="text-xs bg-zinc-900 p-4 rounded-lg overflow-auto max-h-48">
              {(raid?.data as { mdstat?: string })?.mdstat ??
                JSON.stringify(raid?.data ?? {}, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
