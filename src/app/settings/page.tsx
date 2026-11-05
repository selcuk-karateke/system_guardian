import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationSettingsPanel } from "@/components/settings/notification-settings-panel";
import { ProtectPanel } from "@/components/settings/protect-panel";
import { RuntimeConfigPanel } from "@/components/settings/runtime-config-panel";
import { ServerAdminPanel } from "@/components/settings/server-admin-panel";
import { getProtectStatusAction } from "@/app/actions/protect";
import { getDomains } from "@/lib/dashboard-data";
import { getNotificationPublicStatus } from "@/lib/notifications/status";
import { getCheckMode } from "@/lib/config";
import {
  DEFAULT_THRESHOLDS,
  ensureRuntimeConfig,
  getRuntimeConfigSnapshot,
} from "@/lib/runtime-config";
import { listServersSshStatus } from "@/lib/servers-ssh";

export default async function SettingsPage() {
  let domains: Awaited<ReturnType<typeof getDomains>> = [];
  let serverRows: Awaited<ReturnType<typeof listServersSshStatus>> = [];
  try {
    domains = await getDomains();
    serverRows = await listServersSshStatus();
  } catch {
    /* empty */
  }

  await ensureRuntimeConfig().catch(() => null);
  const runtime = getRuntimeConfigSnapshot();

  const [notificationStatus, protect] = await Promise.all([
    getNotificationPublicStatus().catch(() => ({
      telegram: false,
      discord: false,
      email: false,
      telegramChatId: null,
      smtpHost: null,
      smtpTo: null,
      hasDiscordWebhook: false,
    })),
    getProtectStatusAction().catch(() => ({
      autoBlockEnabled: false,
      backupTriggerEnabled: false,
      backupTriggerCommand: null,
      coolifyRedeployConfigured: false,
      coolifyApiUrl: null,
    })),
  ]);

  const checkMode = getCheckMode();
  const sshHost = null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Einstellungen</h1>

      <Card id="protect">
        <CardHeader>
          <CardTitle>Schutz</CardTitle>
        </CardHeader>
        <CardContent>
          <ProtectPanel
            autoBlockEnabled={protect.autoBlockEnabled}
            backupTriggerEnabled={protect.backupTriggerEnabled}
            backupTriggerCommand={protect.backupTriggerCommand}
            coolifyRedeployConfigured={protect.coolifyRedeployConfigured}
            coolifyApiUrl={protect.coolifyApiUrl}
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
            servers={serverRows}
            sshHost={sshHost}
            checkMode={checkMode}
          />
        </CardContent>
      </Card>

      <Card id="runtime">
        <CardHeader>
          <CardTitle>Schwellen & Trusted IPs</CardTitle>
        </CardHeader>
        <CardContent>
          <RuntimeConfigPanel
            thresholds={runtime.thresholds ?? { ...DEFAULT_THRESHOLDS }}
            trusted={runtime.trusted}
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
          <NotificationSettingsPanel status={notificationStatus} />
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
          <p className="text-xs pt-2 border-t border-zinc-800">
            Nur noch Deploy-Runtime in ENV:{" "}
            <code className="text-zinc-300">DATABASE_URL</code>,{" "}
            <code className="text-zinc-300">CRON_SECRET</code>,{" "}
            <code className="text-zinc-300">CHECK_MODE</code>,{" "}
            <code className="text-zinc-300">AUTH_*</code>. Alles andere in der DB
            (Server / Schwellen / Benachrichtigungen).
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
