import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { AlertList } from "@/components/dashboard/alert-list";
import { TriggerChecks } from "@/components/dashboard/trigger-checks";
import { MockDataBanner } from "@/components/dashboard/mock-data-banner";
import {
  getLatestCheckByModule,
  getRecentAlerts,
  getServerOverview,
} from "@/lib/dashboard-data";
import { getServerById } from "@/lib/servers";
import { formatUptime } from "@/lib/utils";

export default async function ServerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const server = await getServerById(id);
  if (!server) notFound();

  let overview: Awaited<ReturnType<typeof getServerOverview>> | null = null;
  let recentAlerts: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  let logsCheck: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;
  let backupsCheck:
    | Awaited<ReturnType<typeof getLatestCheckByModule>>
    | undefined;
  let dbError: string | null = null;

  try {
    overview = await getServerOverview(id);
    recentAlerts = await getRecentAlerts(10, { serverId: id });
    logsCheck = (await getLatestCheckByModule("logs", id)) ?? undefined;
    backupsCheck = (await getLatestCheckByModule("backups", id)) ?? undefined;
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Database unavailable";
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs text-zinc-500 mb-1">
            <Link href="/" className="sg-link hover:underline">
              ← Server-Liste
            </Link>
          </p>
          <h1 className="text-3xl font-bold">{server.name}</h1>
          <p className="text-zinc-400 mt-1 font-mono text-sm">
            {server.ipv4 ?? server.host}
          </p>
        </div>
        <div className="flex flex-col items-end gap-4">
          <StatusBadge status={overview?.status ?? "healthy"} />
          <TriggerChecks variant="compact" />
        </div>
      </div>

      {overview?.checkMode === "mock" && <MockDataBanner />}

      {dbError && (
        <Card className="border-amber-800">
          <CardContent className="pt-6 text-amber-300">{dbError}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-zinc-500">Host</dt>
              <dd className="font-medium">{server.host}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">IP</dt>
              <dd>{server.ipv4 ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">IPv6</dt>
              <dd>{server.ipv6 ?? "—"}</dd>
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

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Logs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Status:{" "}
              <span
                className={
                  logsCheck?.status === "critical"
                    ? "text-red-400"
                    : logsCheck?.status === "warning"
                      ? "text-amber-400"
                      : "text-emerald-400"
                }
              >
                {logsCheck?.status ?? "—"}
              </span>
            </p>
            {!logsCheck && (
              <p className="text-zinc-500">Noch kein Log-Check ausgeführt.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Backups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Status:{" "}
              <span
                className={
                  backupsCheck?.status === "critical"
                    ? "text-red-400"
                    : backupsCheck?.status === "warning"
                      ? "text-amber-400"
                      : "text-emerald-400"
                }
              >
                {backupsCheck?.status ?? "—"}
              </span>
            </p>
            {!backupsCheck && (
              <p className="text-zinc-500">Noch kein Backup-Check ausgeführt.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ereignisse (dieser Server)</CardTitle>
        </CardHeader>
        <CardContent>
          <AlertList
            compact
            items={recentAlerts.map((a) => ({
              id: a.id,
              level: a.level,
              module: a.module,
              message: a.message,
              recommendation: a.recommendation,
              createdAt: a.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-zinc-600">
        Live-Details weiter unter{" "}
        <Link href="/monitor" className="sg-link underline">
          Monitor
        </Link>{" "}
        ·{" "}
        <Link href="/security" className="sg-link underline">
          Sicherheit
        </Link>{" "}
        ·{" "}
        <Link href="/history" className="sg-link underline">
          Historie
        </Link>
      </p>
    </div>
  );
}
