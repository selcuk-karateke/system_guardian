import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertList } from "@/components/dashboard/alert-list";
import { DismissAlertsButton } from "@/components/dashboard/dismiss-alerts";
import { getRecentAlerts } from "@/lib/dashboard-data";

export default async function NotificationsPage() {
  let alertRows: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  try {
    alertRows = await getRecentAlerts(100);
  } catch {
    /* empty */
  }

  const items = alertRows.map((a) => ({
    id: a.id,
    level: a.level,
    module: a.module,
    message: a.message,
    recommendation: a.recommendation,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Benachrichtigungen</h1>
        <DismissAlertsButton />
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
