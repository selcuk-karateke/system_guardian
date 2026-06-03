import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDomains } from "@/lib/dashboard-data";

export default async function SettingsPage() {
  let domains: Awaited<ReturnType<typeof getDomains>> = [];
  try {
    domains = await getDomains();
  } catch {
    /* empty */
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Einstellungen</h1>

      <Card>
        <CardHeader>
          <CardTitle>Überwachte Domains</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {domains.map((d) => (
              <li key={d.id} className="flex gap-4">
                <span className="font-medium">{d.domain}</span>
                <span className="text-zinc-500">
                  HTTP {d.checkHttp ? "✓" : "—"} / HTTPS {d.checkHttps ? "✓" : "—"}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500 mt-4">
            Domains werden per Seed und DB verwaltet. CRUD-API kann später ergänzt
            werden.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Benachrichtigungen</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-zinc-400">
          <p>Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID</p>
          <p>E-Mail: SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_TO</p>
          <p>Cron: CRON_SECRET für /api/cron/*</p>
          <p>Checks: CHECK_MODE=mock (lokal) | ssh (Produktion)</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Intervalle (Coolify Scheduled Tasks)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm font-mono text-zinc-400 space-y-1">
          <p>15 min → GET /api/cron/server</p>
          <p>60 min → GET /api/cron/security</p>
          <p>09:00 → GET /api/cron/daily-report</p>
        </CardContent>
      </Card>
    </div>
  );
}
