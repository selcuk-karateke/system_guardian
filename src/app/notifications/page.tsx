import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertList } from "@/components/dashboard/alert-list";
import { CopyReportButton } from "@/components/dashboard/copy-report-button";
import { DismissAlertsButton } from "@/components/dashboard/dismiss-alerts";
import {
  buildAlertReport,
  buildAlertsBundleReport,
} from "@/lib/alerts/report";
import {
  getLatestCheckByModule,
  getRecentAlerts,
  getServerOverview,
} from "@/lib/dashboard-data";

export default async function NotificationsPage() {
  let alertRows: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  let overview: Awaited<ReturnType<typeof getServerOverview>> | null = null;

  try {
    [alertRows, overview] = await Promise.all([
      getRecentAlerts(100),
      getServerOverview(),
    ]);
  } catch {
    /* empty */
  }

  const modules = [...new Set(alertRows.map((a) => a.module))];
  const checksByModule: Record<
    string,
    { status: string; createdAt: Date; data: Record<string, unknown> } | null
  > = {};
  for (const mod of modules) {
    const row = await getLatestCheckByModule(mod);
    checksByModule[mod] = row
      ? {
          status: row.status,
          createdAt: row.createdAt,
          data: row.data as Record<string, unknown>,
        }
      : null;
  }

  const sshHost = process.env.SSH_HOST;
  const hostIp =
    sshHost ?? overview?.server?.ipv4 ?? overview?.server?.host ?? undefined;
  const hostLabel =
    sshHost && overview?.server?.name === "Primary Server"
      ? "Production"
      : overview?.server?.name;

  const bundleReport = buildAlertsBundleReport(alertRows, {
    hostLabel,
    hostIp,
    checkMode: overview?.checkMode,
    checksByModule,
  });

  const items = alertRows.map((a) => ({
    id: a.id,
    level: a.level,
    module: a.module,
    message: a.message,
    recommendation: a.recommendation,
    createdAt: a.createdAt.toISOString(),
    reportText: buildAlertReport(a, {
      hostLabel,
      hostIp,
      checkMode: overview?.checkMode,
      check: checksByModule[a.module] ?? null,
    }),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Benachrichtigungen</h1>
        <div className="flex flex-wrap gap-2">
          {alertRows.length > 0 && (
            <CopyReportButton
              text={bundleReport}
              label="Alle als Bericht kopieren"
              copiedLabel="Sammelbericht kopiert!"
            />
          )}
          <DismissAlertsButton />
        </div>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardContent className="pt-6 text-sm text-zinc-400 space-y-2">
          <p>
            <strong className="text-zinc-300">Entschärfen</strong> pro Zeile: Du markierst
            die Meldung als „nicht relevant“ – sie verschwindet aus dem Dashboard und
            Monitor, bleibt aber in der DB (mit Zeitstempel „geschlossen“).
          </p>
          <p>
            <strong className="text-zinc-300">Alle schließen</strong>: Alle offenen Warnungen
            auf einmal entschärfen (z. B. nach dem ersten Test-Scan).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Offene Warnungen</CardTitle>
        </CardHeader>
        <CardContent>
          <AlertList items={items} />
        </CardContent>
      </Card>
    </div>
  );
}
