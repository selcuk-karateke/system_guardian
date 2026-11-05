import { db } from "@/db";
import { changeEvents } from "@/db/schema";
import { getCheckMode } from "@/lib/config";
import { resolveBackupConfig } from "@/lib/servers-backup";
import { getSshClient } from "@/lib/ssh";

/** Absolute path + safe chars only (no shell metacharacters). */
const SAFE_CMD = /^\/[a-zA-Z0-9._/\-]+(?:\s+\/[a-zA-Z0-9._/\-]+)*$/;

export function validateBackupTriggerCommand(cmd: string): string | null {
  const trimmed = cmd.trim();
  if (!trimmed) return "Backup-Trigger-Befehl ist leer";
  if (!SAFE_CMD.test(trimmed)) {
    return "Befehl muss absoluter Pfad ohne Shell-Metazeichen sein (z.B. /usr/local/bin/run-backup.sh)";
  }
  return null;
}

export type BackupTriggerResult = {
  ok: boolean;
  message: string;
  stdout?: string;
};

/**
 * Führt den konfigurierten Backup-Befehl auf dem SSH-Host aus.
 * Nur wenn triggerCommand am Server gesetzt und syntaktisch safe ist.
 */
export async function runBackupTrigger(
  serverId: string,
): Promise<BackupTriggerResult> {
  if (getCheckMode() !== "ssh") {
    return {
      ok: false,
      message: "Backup-Trigger braucht CHECK_MODE=ssh",
    };
  }

  const { triggerCommand: cmd } = await resolveBackupConfig(serverId);
  if (!cmd) {
    return {
      ok: false,
      message:
        "Backup-Trigger deaktiviert — unter Einstellungen → Server Trigger-Befehl setzen",
    };
  }
  const invalid = validateBackupTriggerCommand(cmd);
  if (invalid) {
    return { ok: false, message: invalid };
  }

  const ssh = await getSshClient(serverId);
  const result = await ssh.exec(cmd);
  const ok = result.code === 0;
  const snippet = (result.stdout || result.stderr || "").slice(0, 500);

  await db.insert(changeEvents).values({
    serverId,
    category: "protect",
    changeType: "backup_trigger",
    entityKey: cmd.slice(0, 255),
    previousValue: null,
    newValue: `code=${result.code} ${snippet}`.slice(0, 2000),
  });

  return {
    ok,
    message: ok
      ? `Backup-Job gestartet (${cmd})`
      : `Backup-Job fehlgeschlagen (exit ${result.code}): ${snippet || "kein Output"}`,
    stdout: snippet,
  };
}
