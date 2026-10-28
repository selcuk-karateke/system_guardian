"use client";

import { useState, useTransition } from "react";
import { triggerBackupAction } from "@/app/actions/protect";
import { Button } from "@/components/ui/button";

type Props = {
  autoBlockEnabled: boolean;
  backupTriggerEnabled: boolean;
  backupTriggerCommand: string | null;
  coolifyRedeployConfigured: boolean;
  coolifyApiUrl: string | null;
  checkMode: string;
};

export function ProtectPanel({
  autoBlockEnabled,
  backupTriggerEnabled,
  backupTriggerCommand,
  coolifyRedeployConfigured,
  coolifyApiUrl,
  checkMode,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <div className="space-y-4 text-sm">
      <ul className="space-y-2 text-zinc-300">
        <li>
          <span className="text-zinc-200 font-medium">Auto-Block (fail2ban):</span>{" "}
          {autoBlockEnabled ? (
            <span className="text-amber-400">an</span>
          ) : (
            <span className="text-zinc-500">aus</span>
          )}
          <p className="text-xs text-zinc-500 mt-1">
            Nur IPs aus <code className="text-zinc-400">BLOCKED_REMOTE_IPS</code>.
            Opt-in: <code className="text-zinc-400">AUTO_BLOCK_ENABLED=true</code>
            {", "}Jail <code className="text-zinc-400">AUTO_BLOCK_JAIL</code> (Standard sshd).
            Audit unter /history (category protect).
          </p>
        </li>
        <li>
          <span className="text-zinc-200 font-medium">Backup-Trigger:</span>{" "}
          {backupTriggerEnabled ? (
            <span className="text-emerald-400">konfiguriert</span>
          ) : (
            <span className="text-zinc-500">nicht gesetzt</span>
          )}
          {backupTriggerCommand && (
            <p className="text-xs text-zinc-500 mt-1 font-mono break-all">
              {backupTriggerCommand}
            </p>
          )}
          <p className="text-xs text-zinc-500 mt-1">
            Env <code className="text-zinc-400">BACKUP_TRIGGER_COMMAND</code> =
            absoluter Pfad auf dem SSH-Host. Restore führt Guardian nie aus.
          </p>
        </li>
        <li>
          <span className="text-zinc-200 font-medium">Coolify Force-Rebuild:</span>{" "}
          {coolifyRedeployConfigured ? (
            <span className="text-emerald-400">API bereit</span>
          ) : (
            <span className="text-zinc-500">nicht gesetzt</span>
          )}
          {coolifyApiUrl && (
            <p className="text-xs text-zinc-500 mt-1 font-mono break-all">
              {coolifyApiUrl}
            </p>
          )}
          <p className="text-xs text-zinc-500 mt-1">
            <code className="text-zinc-400">COOLIFY_API_URL</code> +{" "}
            <code className="text-zinc-400">COOLIFY_API_TOKEN</code> (Deploy-Recht).
            Button <strong className="text-zinc-400">Rebuild</strong> auf /docker.
            App-CVEs (next, auth, …): erst Lockfile committen, dann Rebuild — sonst
            ändert sich nichts.
          </p>
        </li>
        <li className="text-xs text-zinc-500">
          Check-Modus: <code className="text-zinc-400">{checkMode}</code>
          {checkMode !== "ssh" && " — SSH-Schutz-Aktionen brauchen ssh"}
        </li>
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !backupTriggerEnabled || checkMode !== "ssh"}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await triggerBackupAction();
              setIsError(!result.ok);
              setMessage(result.message);
            });
          }}
        >
          Backup jetzt anstoßen
        </Button>
      </div>

      {message && (
        <p className={`text-sm ${isError ? "text-amber-400" : "text-emerald-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
