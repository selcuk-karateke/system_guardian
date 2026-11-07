"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  alignServerWithSshHostAction,
  createServerAction,
  deactivateServerAction,
  installAgentViaSshAction,
  rotateAgentTokenAction,
  updateServerBackupAction,
  updateServerCoolifyAction,
  updateServerSshAction,
} from "@/app/actions/servers";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/lib/ui/field";
import { notify, notifyResult } from "@/lib/ui/notify";

export type ServerAdminRow = {
  id: string;
  name: string;
  host: string;
  ipv4: string | null;
  monitorProfile: string;
  sshUser: string | null;
  sshPort: number | null;
  hasKey: boolean;
  hasPassword: boolean;
  coolifyApiUrl: string | null;
  hasCoolifyToken: boolean;
  backupPaths: string | null;
  backupMonitoringDir: string | null;
  backupTriggerCommand: string | null;
  hasBackupTrigger: boolean;
  hasAgentToken?: boolean;
  agentOnline?: boolean;
  agentLastSeenAt?: string | null;
  agentVersion?: string | null;
};

export function ServerAdminPanel({
  servers,
  sshHost,
  checkMode,
}: {
  servers: ServerAdminRow[];
  sshHost?: string | null;
  checkMode?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editId, setEditId] = useState<string | null>(null);
  const [installCmd, setInstallCmd] = useState<string | null>(null);
  const [installFor, setInstallFor] = useState<string | null>(null);

  function mismatchesSsh(s: ServerAdminRow) {
    if (checkMode !== "ssh" || !sshHost) return false;
    const hosts = new Set(
      [s.host, s.ipv4].filter(Boolean).map((h) => h!.toLowerCase()),
    );
    return !hosts.has(sshHost.toLowerCase()) && !s.hasKey;
  }

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setInstallCmd(null);
    startTransition(async () => {
      const result = await createServerAction(formData);
      notifyResult(result);
      if (result.ok) {
        form.reset();
        if (result.agentInstallCmd) {
          setInstallCmd(result.agentInstallCmd);
          setInstallFor(result.id ?? null);
        }
        router.refresh();
      }
    });
  }

  function onRotateAgent(serverId: string) {
    if (
      !confirm(
        "Neuen Agent-Token ausstellen? Der alte Token funktioniert danach nicht mehr.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await rotateAgentTokenAction(serverId);
      notifyResult(result);
      if (result.ok && result.agentInstallCmd) {
        setInstallCmd(result.agentInstallCmd);
        setInstallFor(serverId);
      }
      if (result.ok) router.refresh();
    });
  }

  function onInstallAgent(serverId: string, name: string) {
    if (
      !confirm(
        `Metrics-Agent per SSH auf „${name}“ installieren?\n(Token wird erst nach erfolgreichem Deploy gewechselt — kein 401-Loop bei Fehler)`,
      )
    ) {
      return;
    }
    setInstallCmd(null);
    startTransition(async () => {
      const result = await installAgentViaSshAction(serverId);
      notifyResult(result);
      if (result.agentInstallCmd) {
        setInstallCmd(result.agentInstallCmd);
        setInstallFor(serverId);
      }
      router.refresh();
    });
  }

  function onSaveSsh(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateServerSshAction(formData);
      notifyResult(result);
      if (result.ok) {
        setEditId(null);
        router.refresh();
      }
    });
  }

  function onSaveCoolify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateServerCoolifyAction(formData);
      notifyResult(result);
      if (result.ok) router.refresh();
    });
  }

  function onSaveBackup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateServerBackupAction(formData);
      notifyResult(result);
      if (result.ok) router.refresh();
    });
  }

  function onDeactivate(id: string, name: string) {
    if (!confirm(`Server „${name}“ wirklich deaktivieren?`)) return;
    startTransition(async () => {
      const result = await deactivateServerAction(id);
      notifyResult(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {installCmd && (
        <div className="rounded-lg border border-sky-800/60 bg-sky-950/30 px-3 py-3 space-y-2">
          <p className="text-xs font-medium text-sky-200">
            Metrics-Agent installieren
            {installFor ? ` · Server ${installFor.slice(0, 8)}…` : ""}
          </p>
          <p className="text-[11px] text-zinc-400">
            Auf dem Host ausführen (Root). Token wird nur einmal angezeigt.
          </p>
          <pre className="overflow-x-auto rounded-md bg-zinc-950 p-2 text-[11px] text-zinc-200 font-mono whitespace-pre-wrap break-all">
            {installCmd}
          </pre>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => {
              void navigator.clipboard?.writeText(installCmd);
              notify({ message: "Install-Befehl kopiert", tone: "ok" });
            }}
          >
            Kopieren
          </Button>
        </div>
      )}
      <ul className="space-y-3 text-sm">
        {servers.map((s) => (
          <li
            key={s.id}
            className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3 space-y-3"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-100 truncate">{s.name}</p>
                <p className="text-xs text-zinc-500 font-mono truncate">
                  {s.ipv4 ?? s.host} · {s.sshUser ?? "root"}:
                  {s.sshPort ?? 22} · Profil {s.monitorProfile}
                </p>
                <p className="text-xs mt-1 text-zinc-400 space-x-2">
                  <span>
                    SSH:{" "}
                    {s.hasKey || s.hasPassword ? (
                      <span className="text-emerald-400">
                        {s.hasKey ? "Key" : ""}
                        {s.hasKey && s.hasPassword ? "+" : ""}
                        {s.hasPassword ? "Passwort" : ""}
                      </span>
                    ) : (
                      <span className="text-amber-400">offen</span>
                    )}
                  </span>
                  <span>·</span>
                  <span>
                    Coolify:{" "}
                    {s.coolifyApiUrl && s.hasCoolifyToken ? (
                      <span className="text-emerald-400">API</span>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </span>
                  <span>·</span>
                  <span>
                    Backup:{" "}
                    {s.hasBackupTrigger ? (
                      <span className="text-emerald-400">Trigger</span>
                    ) : s.backupPaths ? (
                      <span className="text-zinc-300">Pfade</span>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </span>
                  <span>·</span>
                  <span>
                    Agent:{" "}
                    {s.agentOnline ? (
                      <span className="text-emerald-400">
                        online{s.agentVersion ? ` v${s.agentVersion}` : ""}
                      </span>
                    ) : s.hasAgentToken ? (
                      <span className="text-amber-400">warte</span>
                    ) : (
                      <span className="text-zinc-500">kein Token</span>
                    )}
                  </span>
                </p>
              </div>
              {mismatchesSsh(s) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs border-amber-800 text-amber-300"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await alignServerWithSshHostAction(s.id);
                      notifyResult(result);
                      if (result.ok) router.refresh();
                    });
                  }}
                >
                  Host → SSH_HOST
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs border-sky-800 text-sky-200"
                disabled={
                  pending ||
                  (checkMode === "ssh" && !s.hasKey && !s.hasPassword)
                }
                title={
                  checkMode === "ssh" && !s.hasKey && !s.hasPassword
                    ? "Zuerst SSH-Zugang speichern"
                    : "Agent per SSH installieren"
                }
                onClick={() => onInstallAgent(s.id, s.name)}
              >
                {s.agentOnline ? "Agent neu installieren" : "Agent installieren"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={pending}
                onClick={() => onRotateAgent(s.id)}
              >
                Agent-Token
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={pending}
                onClick={() => setEditId(editId === s.id ? null : s.id)}
              >
                {editId === s.id ? "Schließen" : "Bearbeiten"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={pending || servers.length <= 1}
                onClick={() => onDeactivate(s.id, s.name)}
              >
                Deaktivieren
              </Button>
            </div>

            {editId === s.id && (
              <div className="space-y-5 border-t border-zinc-800 pt-3">
                <form
                  onSubmit={onSaveSsh}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <p className="sm:col-span-2 text-xs font-medium text-zinc-300">
                    SSH
                  </p>
                  <input type="hidden" name="serverId" value={s.id} />
                  <label className="space-y-1 text-xs text-zinc-400">
                    Host
                    <input
                      name="host"
                      defaultValue={s.host}
                      className={fieldClass}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400">
                    IPv4
                    <input
                      name="ipv4"
                      defaultValue={s.ipv4 ?? ""}
                      className={fieldClass}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400">
                    SSH User
                    <input
                      name="sshUser"
                      defaultValue={s.sshUser ?? "root"}
                      className={fieldClass}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400">
                    SSH Port
                    <input
                      name="sshPort"
                      type="number"
                      defaultValue={s.sshPort ?? 22}
                      className={fieldClass}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
                    Private Key (leer = unverändert)
                    <textarea
                      name="privateKey"
                      rows={3}
                      placeholder={
                        s.hasKey ? "•••• gespeichert" : "-----BEGIN …"
                      }
                      className={fieldClass + " font-mono text-xs"}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
                    Passwort (optional, leer = unverändert)
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      className={fieldClass}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    <input type="checkbox" name="clearPrivateKey" />
                    Key löschen
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    <input type="checkbox" name="clearPassword" />
                    Passwort löschen
                  </label>
                  <div className="sm:col-span-2">
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? "…" : "SSH speichern"}
                    </Button>
                  </div>
                </form>

                <form
                  onSubmit={onSaveCoolify}
                  className="grid gap-3 sm:grid-cols-2 border-t border-zinc-800 pt-4"
                >
                  <p className="sm:col-span-2 text-xs font-medium text-zinc-300">
                    Optional: Coolify API
                  </p>
                  <p className="sm:col-span-2 text-[11px] text-zinc-500">
                    Nur nötig für Force-Rebuild / Deploy-Meta. Stack-Check läuft
                    automatisch, wenn Coolify-Container erkannt werden.
                  </p>
                  <input type="hidden" name="serverId" value={s.id} />
                  <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
                    Panel-URL
                    <input
                      name="coolifyApiUrl"
                      defaultValue={s.coolifyApiUrl ?? ""}
                      placeholder="https://coolify.example.com"
                      className={fieldClass}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
                    API-Token (Deploy-Recht, leer = unverändert)
                    <input
                      name="coolifyApiToken"
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        s.hasCoolifyToken ? "•••• gespeichert" : "Token"
                      }
                      className={fieldClass}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
                    <input type="checkbox" name="clearCoolifyToken" />
                    Token löschen
                  </label>
                  <div className="sm:col-span-2">
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? "…" : "Coolify speichern"}
                    </Button>
                  </div>
                </form>

                <form
                  onSubmit={onSaveBackup}
                  className="grid gap-3 sm:grid-cols-2 border-t border-zinc-800 pt-4"
                >
                  <p className="sm:col-span-2 text-xs font-medium text-zinc-300">
                    Backup (optional)
                  </p>
                  <p className="sm:col-span-2 text-[11px] text-zinc-500">
                    Leer = Check übersprungen. Beispiel:{" "}
                    <code className="text-zinc-400">
                      /backups/daily,/backups/monthly
                    </code>
                    ; bei Coolify oft zusätzlich{" "}
                    <code className="text-zinc-400">/data/coolify/backups</code>
                    .
                  </p>
                  <input type="hidden" name="serverId" value={s.id} />
                  <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
                    Pfade (kommagetrennt)
                    <input
                      name="backupPaths"
                      defaultValue={s.backupPaths ?? ""}
                      placeholder="/backups/daily,/backups/monthly"
                      className={fieldClass + " font-mono text-xs"}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
                    Monitoring-Dir (status.json)
                    <input
                      name="backupMonitoringDir"
                      defaultValue={s.backupMonitoringDir ?? ""}
                      placeholder="/backups/monitoring"
                      className={fieldClass + " font-mono text-xs"}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
                    Trigger-Befehl (absoluter Pfad, leer = aus)
                    <input
                      name="backupTriggerCommand"
                      defaultValue={s.backupTriggerCommand ?? ""}
                      placeholder="/usr/local/bin/run-backup.sh"
                      className={fieldClass + " font-mono text-xs"}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
                    <input type="checkbox" name="clearBackupTrigger" />
                    Trigger löschen
                  </label>
                  <div className="sm:col-span-2">
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? "…" : "Backup speichern"}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </li>
        ))}
        {servers.length === 0 && (
          <li className="text-zinc-500">Noch keine Server.</li>
        )}
      </ul>

      <form
        onSubmit={onCreate}
        className="space-y-3 border-t border-zinc-800 pt-4"
      >
        <p className="text-sm font-medium text-zinc-200">Neuen Server anlegen</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-zinc-400">
            Name
            <input
              name="name"
              required
              placeholder="z. B. Kawai Prod"
              className={fieldClass}
            />
          </label>
          <label className="space-y-1 text-xs text-zinc-400">
            Host / IP (SSH-Ziel)
            <input
              name="host"
              required
              placeholder="hostname oder IP"
              className={fieldClass}
            />
          </label>
          <label className="space-y-1 text-xs text-zinc-400">
            IPv4 (optional)
            <input name="ipv4" placeholder="1.2.3.4" className={fieldClass} />
          </label>
          <label className="space-y-1 text-xs text-zinc-400">
            Monitoring-Profil
            <select
              name="monitorProfile"
              defaultValue="host"
              className={fieldClass}
            >
              <option value="host">host — voller Host</option>
              <option value="container">container — App-Fokus</option>
              <option value="full">full — alles</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-zinc-400">
            SSH User
            <input name="sshUser" defaultValue="root" className={fieldClass} />
          </label>
          <label className="space-y-1 text-xs text-zinc-400">
            SSH Port
            <input
              name="sshPort"
              type="number"
              defaultValue={22}
              className={fieldClass}
            />
          </label>
          <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
            Private Key
            <textarea
              name="privateKey"
              rows={3}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              className={fieldClass + " font-mono text-xs"}
            />
          </label>
        </div>
        <p className="text-xs text-zinc-500">
          Secrets verschlüsselt in der DB (
          <code className="text-zinc-400">AUTH_SECRET</code>). SSH, optionale
          Backup-Pfade und Coolify-API danach unter Bearbeiten setzen.
        </p>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Speichern…" : "Server anlegen"}
        </Button>
      </form>
    </div>
  );
}
