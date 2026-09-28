import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { modulesForBatch } from "@/lib/docs/module-catalog";
import { MODULE_LABELS } from "@/lib/module-labels";

const LAYERS = [
  { layer: "UI", path: "src/app/", job: "Dashboard, Monitor, Settings" },
  { layer: "Cron-API", path: "src/app/api/cron/", job: "Geplante Check-Batches" },
  { layer: "Checks", path: "src/lib/checks/", job: "Ein Modul ≈ ein Check" },
  { layer: "SSH", path: "src/lib/ssh/", job: "Live-Client + Mock (Windows)" },
  { layer: "Alerts", path: "src/lib/alerts/", job: "Dedup, Persistenz, Auto-Resolve" },
  { layer: "Notify", path: "src/lib/notifications/", job: "Telegram, Discord, E-Mail" },
] as const;

const TUNE = [
  ["Zielhost", "CHECK_MODE, SSH_HOST, SSH_USER, SSH_*_KEY"],
  ["Trust", "TRUSTED_LOGIN_IPS, TRUSTED_OUTBOUND_IPS"],
  ["Ports/Docker", "KNOWN_PORTS, KNOWN_DOCKER_IMAGE_PREFIXES"],
  ["Backup/FIM", "BACKUP_PATHS, FIM_PATHS"],
  ["Schwellen", "THRESHOLD_CPU_*, THRESHOLD_RAM_*, …"],
] as const;

function ModuleTable({ batch }: { batch: "server" | "security" }) {
  const rows = modulesForBatch(batch);
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden text-sm">
      <table className="w-full">
        <tbody>
          {rows.map((m) => (
            <tr
              key={m.id}
              className="border-b border-zinc-800/80 last:border-0"
            >
              <td className="px-3 py-2 font-mono text-xs text-sky-400/90 w-40">
                {m.id}
              </td>
              <td className="px-3 py-2 text-zinc-500 text-xs w-28">
                {MODULE_LABELS[m.id] ?? "—"}
              </td>
              <td className="px-3 py-2 text-zinc-400">{m.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SysadminDocsPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Link href="/docs" className="text-sm text-sky-400 hover:underline">
          ← Dokumentation
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Sysadmin-Handbuch
        </h1>
        <p className="mt-2 text-zinc-400 text-sm leading-relaxed">
          Kurzfassung für Ops-Collaborators. Modul-Tabellen kommen aus dem Code
          (<code className="text-zinc-300">module-catalog.ts</code>
          ); Drift prüft <code className="text-zinc-300">npm run docs:check</code>
          . Ausführlich: <code className="text-zinc-300">docs/SYSADMIN.md</code>
        </p>
      </div>

      <Card className="border-sky-900/50 bg-sky-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Aktuell halten / PRs</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-300 space-y-2">
          <p>
            <strong className="text-zinc-100">Maschine:</strong> neues
            Check-Modul oder API-Route ohne Katalog/OpenAPI →{" "}
            <code className="text-xs">docs:check</code> schlägt fehl (sichtbarer
            Diff). Die Tabellen unten spiegeln den Katalog, der an die
            registrierten Checks gebunden ist.
          </p>
          <p>
            <strong className="text-zinc-100">Mensch:</strong> Prosa,
            Troubleshooting, Env-Erklärungen in{" "}
            <code className="text-xs">docs/SYSADMIN.md</code> / dieser Seite
            pflegen — das erkennt kein Script automatisch.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Was ist das?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-300 space-y-2">
          <p>
            Monitoring + Security-light für einen Coolify-Host –{" "}
            <strong className="text-zinc-100">ohne Agent</strong>, per SSH
            (`ss`, `docker`, `journalctl`, …), Speicherung in PostgreSQL, Alerts
            per Telegram/Discord/E-Mail.
          </p>
          <p className="text-zinc-500">
            Vergleichbar mit Teilen von Zabbix/Netdata + Wazuh-light + Uptime –
            in einer App.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wo ist was? (Code)</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm">
            {LAYERS.map((row) => (
              <div
                key={row.layer}
                className="grid grid-cols-[7rem_1fr] gap-2 border-b border-zinc-800/80 pb-2 last:border-0"
              >
                <dt className="text-zinc-500">{row.layer}</dt>
                <dd>
                  <code className="text-sky-400/90 text-xs">{row.path}</code>
                  <span className="text-zinc-400"> — {row.job}</span>
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Server-Batch{" "}
          <span className="text-zinc-500 font-normal text-sm">
            /api/cron/server · 15 min
          </span>
        </h2>
        <ModuleTable batch="server" />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Security-Batch{" "}
          <span className="text-zinc-500 font-normal text-sm">
            /api/cron/security · 60 min
          </span>
        </h2>
        <ModuleTable batch="security" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Typisch konfigurieren (ohne Code)</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm">
            {TUNE.map(([topic, vars]) => (
              <div key={topic} className="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt className="text-zinc-500">{topic}</dt>
                <dd className="font-mono text-xs text-zinc-300">{vars}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-zinc-500">
            False Positives zuerst über Trust/Allowlists entschärfen – siehe{" "}
            <code>.env.example</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zuarbeit</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-300 space-y-1">
          <ol className="list-decimal pl-4 space-y-1">
            <li>Allowlist / Trust-IP / Expected-Container</li>
            <li>Thresholds in Env dokumentieren</li>
            <li>
              Neues Modul: Check → <code>index.ts</code> → Label → Katalog →{" "}
              <code>npm run docs:check</code>
            </li>
          </ol>
        </CardContent>
      </Card>

      <p className="text-sm text-zinc-500">
        API-Endpunkte:{" "}
        <Link href="/docs/api" className="text-sky-400 hover:underline">
          Redoc
        </Link>
        {" · "}
        Deploy: <code className="text-zinc-400">docs/COOLIFY.md</code>
      </p>
    </div>
  );
}
