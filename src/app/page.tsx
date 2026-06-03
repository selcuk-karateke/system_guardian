import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import {
  getGlobalStatus,
  getRecentAlerts,
  getServerOverview,
} from "@/lib/dashboard-data";
import { formatUptime } from "@/lib/utils";

export default async function DashboardPage() {
  let globalStatus: "healthy" | "warning" | "critical" = "healthy";
  let overview: Awaited<ReturnType<typeof getServerOverview>> | null = null;
  let recentAlerts: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  let dbError: string | null = null;

  try {
    globalStatus = await getGlobalStatus();
    overview = await getServerOverview();
    recentAlerts = await getRecentAlerts(10);
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Database unavailable";
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-zinc-400 mt-1">Gesamtstatus der Infrastruktur</p>
        </div>
        <StatusBadge status={globalStatus} />
      </div>

      {dbError && (
        <Card className="border-amber-800">
          <CardContent className="pt-6 text-amber-300">
            Datenbank nicht erreichbar: {dbError}. Starte PostgreSQL und führe
            npm run db:push && npm run db:seed aus.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Server-Übersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-zinc-500">Server</dt>
              <dd className="font-medium">{overview?.server?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">IP</dt>
              <dd>{overview?.server?.ipv4 ?? overview?.server?.host ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">IPv6</dt>
              <dd>{overview?.server?.ipv6 ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Uptime</dt>
              <dd>
                {overview?.metrics?.uptimeSeconds
                  ? formatUptime(overview.metrics.uptimeSeconds)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">CPU</dt>
              <dd>{overview?.metrics?.cpuPercent ?? "—"}%</dd>
            </div>
            <div>
              <dt className="text-zinc-500">RAM</dt>
              <dd>{overview?.metrics?.ramPercent ?? "—"}%</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Storage</dt>
              <dd>{overview?.metrics?.diskPercent ?? "—"}%</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Docker</dt>
              <dd>{overview?.docker ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Coolify</dt>
              <dd>{overview?.coolify ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Backups</dt>
              <dd>{overview?.backups ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">SSL</dt>
              <dd>{overview?.ssl ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aktuelle Warnungen</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAlerts.length === 0 ? (
            <p className="text-zinc-500 text-sm">Keine offenen Warnungen.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentAlerts.map((a) => (
                <li key={a.id} className="flex gap-2">
                  <span className="text-zinc-500 uppercase text-xs w-16">
                    {a.level}
                  </span>
                  <span className="text-zinc-400 w-28">{a.module}</span>
                  <span>{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
