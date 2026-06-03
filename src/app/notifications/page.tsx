import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRecentAlerts } from "@/lib/dashboard-data";

export default async function NotificationsPage() {
  let alerts: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  try {
    alerts = await getRecentAlerts(100);
  } catch {
    /* empty */
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Benachrichtigungen</h1>
      <Card>
        <CardHeader>
          <CardTitle>Alert-Historie</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-left border-b border-zinc-800">
                <th className="pb-2">Level</th>
                <th>Modul</th>
                <th>Nachricht</th>
                <th>Zeit</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-b border-zinc-900">
                  <td className="py-2">
                    <Badge
                      variant={
                        a.level === "critical"
                          ? "critical"
                          : a.level === "warning"
                            ? "warning"
                            : "default"
                      }
                    >
                      {a.level}
                    </Badge>
                  </td>
                  <td>{a.module}</td>
                  <td>{a.message}</td>
                  <td className="text-zinc-500">
                    {a.createdAt.toLocaleString("de-DE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {alerts.length === 0 && (
            <p className="text-zinc-500 py-4">Keine Alerts in der Historie.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
