import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationTestPanel } from "@/components/settings/notification-test-panel";
import { ProtectPanel } from "@/components/settings/protect-panel";
import { ServerAdminPanel } from "@/components/settings/server-admin-panel";
import { getDomains } from "@/lib/dashboard-data";
import { getNotificationChannelStatus } from "@/lib/notifications/status";
import {
  getBackupTriggerCommand,
  getCheckMode,
  isAutoBlockEnabled,
  isBackupTriggerEnabled,
} from "@/lib/config";
import { listActiveServers } from "@/lib/servers";

export default async function SettingsPage() {
  let domains: Awaited<ReturnType<typeof getDomains>> = [];
  let serverRows: Awaited<ReturnType<typeof listActiveServers>> = [];
  try {
    domains = await getDomains();
    serverRows = await listActiveServers();
  } catch {
    /* empty */
  }

  const notificationStatus = getNotificationChannelStatus();
  const checkMode = getCheckMode();
  const sshHost = process.env.SSH_HOST ?? null;
  const backupCmd = getBackupTriggerCommand();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Einstellungen</h1>

      <Card id="protect">
        <CardHeader>
          <CardTitle>Schutz</CardTitle>
        </CardHeader>
        <CardContent>
          <ProtectPanel
            autoBlockEnabled={isAutoBlockEnabled()}
            backupTriggerEnabled={isBackupTriggerEnabled()}
            backupTriggerCommand={backupCmd || null}
            checkMode={checkMode}
          />
        </CardContent>
      </Card>

      <Card id="servers">
        <CardHeader>
          <CardTitle>Server</CardTitle>
        </CardHeader>
        <CardContent>
          <ServerAdminPanel
            servers={serverRows.map((s) => ({
              id: s.id,
              name: s.name,
              host: s.host,
              ipv4: s.ipv4,
              monitorProfile: s.monitorProfile,
            }))}
            sshHost={sshHost}
            checkMode={checkMode}
          />
        </CardContent>
      </Card>

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
        <CardContent>
          <NotificationTestPanel status={notificationStatus} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Beobachtung & Historie</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400 space-y-2">
          <p>
            <strong className="text-zinc-200">Rollierendes Fenster:</strong>{" "}
            <code className="text-zinc-300">OBSERVATION_HOURS</code> (Standard 24)
            für IOC-Log-Grep in <code>security_posture</code>.
          </p>
          <p>
            <strong className="text-zinc-200">Historie:</strong>{" "}
            <a href="/history" className="text-sky-400 underline">
              /history
            </a>{" "}
            — Checks, Änderungen und Alerts nach Zeitraum filtern; Point-in-time
            zeigt letzten Stand pro Modul.
          </p>
          <p>
            API: <code className="text-zinc-300">GET /api/history?from=&to=&module=</code>
          </p>
          <p className="text-xs">
            Festes Incident-Fenster nur mit{" "}
            <code>INCIDENT_USE_FIXED_WINDOW=true</code> + INCIDENT_LOG_SINCE/UNTIL
            in .env.local.
          </p>
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
