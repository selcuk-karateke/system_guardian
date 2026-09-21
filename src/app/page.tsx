import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { AlertList } from "@/components/dashboard/alert-list";
import { TriggerChecks } from "@/components/dashboard/trigger-checks";
import {
  getGlobalStatus,
  getLatestCheckByModule,
  getRecentAlerts,
  getServerOverview,
} from "@/lib/dashboard-data";
import { MockDataBanner } from "@/components/dashboard/mock-data-banner";
import { formatUptime } from "@/lib/utils";

export default async function DashboardPage() {
  let globalStatus: "healthy" | "warning" | "critical" = "healthy";
  let overview: Awaited<ReturnType<typeof getServerOverview>> | null = null;
  let recentAlerts: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  let logsCheck: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;
  let backupsCheck: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;
  let dbError: string | null = null;

  try {
    globalStatus = await getGlobalStatus();
    overview = await getServerOverview();
    recentAlerts = await getRecentAlerts(10);
    logsCheck = (await getLatestCheckByModule("logs")) ?? undefined;
    backupsCheck = (await getLatestCheckByModule("backups")) ?? undefined;
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Database unavailable";
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-zinc-400 mt-1">Gesamtstatus der Infrastruktur</p>
          <div className="flex flex-wrap gap-4 mt-3 text-sm">
            <Link href="/monitor" className="sg-link hover:underline font-medium">
              Monitor (TV) →
            </Link>
            <Link href="/history" className="sg-link hover:underline font-medium">
              Historie & Zeitfilter →
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-end gap-4">
          <StatusBadge status={globalStatus} />
          <TriggerChecks variant="compact" />
        </div>
      </div>

      {overview?.checkMode === "mock" && <MockDataBanner />}

      {dbError && (
        <Card className="border-amber-800">
          <CardContent className="pt-6 text-amber-300 space-y-2">
            <p>Datenbank nicht erreichbar: {dbError}</p>
            {/zu viele Verbindungen|too many connections|53300/i.test(dbError) ? (
              <p className="text-sm text-amber-200/90">
                PostgreSQL ist voll (zu viele offene Verbindungen durch{" "}
                <code className="text-amber-100">pnpm dev</code> / Scripts):{" "}
                <code className="text-amber-100">pnpm dev</code> stoppen, dann
                PostgreSQL-Dienst neu starten (Windows Admin:{" "}
                <code className="text-amber-100">
                  Restart-Service postgresql-x64-17
                </code>
                ), danach <code className="text-amber-100">pnpm dev</code>{" "}
                wieder starten.
              </p>
            ) : (
              <p className="text-sm text-amber-200/90">
                Prüfe lokales PostgreSQL, DATABASE_URL in .env.local, dann{" "}
                <code className="text-amber-100">npm run db:migrate</code> und{" "}
                <code className="text-amber-100">npm run db:seed</code>.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle>Checks manuell starten</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-400 mb-4">
            Gleiche Aktion wie die Cron-URLs – ohne curl. Nach dem Lauf wird das
            Dashboard aktualisiert.
          </p>
          <TriggerChecks />
        </CardContent>
      </Card>

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
                {overview?.checkMode === "mock" && (
                  <span className="block text-xs text-amber-500/90 mt-0.5">
                    Demo (Mock)
                  </span>
                )}
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
            {(
              (logsCheck?.data as { criticalLines?: string[]; critical?: string[] })
                ?.criticalLines ??
              (logsCheck?.data as { critical?: string[] })?.critical ??
              []
            ).map((line) => (
              <pre
                key={line}
                className="text-xs bg-red-950/40 border border-red-900/50 text-red-200 p-2 rounded whitespace-pre-wrap break-all"
              >
                {line}
              </pre>
            ))}
            {(
              (logsCheck?.data as { warningLines?: string[]; warning?: string[] })
                ?.warningLines ??
              (logsCheck?.data as { warning?: string[] })?.warning ??
              []
            ).map((line) => (
              <pre
                key={line}
                className="text-xs bg-amber-950/30 border border-amber-900/40 text-amber-100 p-2 rounded whitespace-pre-wrap break-all"
              >
                {line}
              </pre>
            ))}
            {!logsCheck && (
              <p className="text-zinc-500">Noch kein Log-Check ausgeführt.</p>
            )}
            {logsCheck &&
              !(
                logsCheck.data as { criticalLines?: string[] }
              )?.criticalLines?.length &&
              !(logsCheck.data as { warningLines?: string[] })?.warningLines
                ?.length && (
                <p className="text-zinc-500">Keine relevanten Logzeilen.</p>
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
            <p className="text-zinc-500 text-xs">
              Pfade:{" "}
              {(
                (backupsCheck?.data as { configuredPaths?: string[] })
                  ?.configuredPaths ?? ["/data/coolify/backups", "/root/*.tar.gz"]
              ).join(", ")}
            </p>
            {(backupsCheck?.data as { summary?: { latestFile?: string; sizeHuman?: string; ageDays?: number; ageHours?: number; maxAgeDays?: number } })
              ?.summary?.latestFile && (
              <dl className="grid gap-1 text-zinc-300">
                <div>
                  <dt className="text-zinc-500 inline">Neuestes: </dt>
                  <dd className="inline font-mono text-xs break-all">
                    {
                      (
                        backupsCheck?.data as {
                          summary?: { latestFile?: string };
                        }
                      ).summary?.latestFile
                    }
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500 inline">Größe: </dt>
                  <dd className="inline">
                    {
                      (
                        backupsCheck?.data as {
                          summary?: { sizeHuman?: string };
                        }
                      ).summary?.sizeHuman
                    }
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500 inline">Alter: </dt>
                  <dd className="inline">
                    {(() => {
                      const s = (
                        backupsCheck?.data as {
                          summary?: {
                            ageHours?: number;
                            ageDays?: number;
                            maxAgeDays?: number;
                          };
                        }
                      ).summary;
                      if (!s) return "—";
                      const label =
                        s.ageHours != null && s.ageHours < 48
                          ? `${Math.round(s.ageHours)}h`
                          : `${Math.round(s.ageDays ?? 0)}d`;
                      return `${label} (Limit ${s.maxAgeDays ?? 7}d)`;
                    })()}
                  </dd>
                </div>
              </dl>
            )}
            {!backupsCheck && (
              <p className="text-zinc-500">Noch kein Backup-Check ausgeführt.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aktuelle Warnungen</CardTitle>
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
    </div>
  );
}
