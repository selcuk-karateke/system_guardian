import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getLatestCheckByModule,
  getServerOverview,
} from "@/lib/dashboard-data";

export default async function InfrastructurePage() {
  let overview: Awaited<ReturnType<typeof getServerOverview>> | null = null;
  let raid: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;
  let error: string | null = null;

  try {
    overview = await getServerOverview();
    raid = await getLatestCheckByModule("raid");
  } catch (e) {
    error = e instanceof Error ? e.message : "DB error";
  }

  const m = overview?.metrics;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Infrastruktur</h1>
      {error && <p className="text-amber-400">{error}</p>}

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
            <p className="text-sm text-zinc-500">RAID-Check in den Einstellungen deaktiviert.</p>
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
