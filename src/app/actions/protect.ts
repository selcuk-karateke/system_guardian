"use server";

import { revalidatePath } from "next/cache";
import {
  getBackupTriggerCommand,
  isAutoBlockEnabled,
  isBackupTriggerEnabled,
} from "@/lib/config";
import { runBackupTrigger } from "@/lib/protect/backup-trigger";
import { getDefaultServerId, listActiveServers } from "@/lib/servers";

export type ProtectActionResult = {
  ok: boolean;
  message: string;
};

async function resolveServerId(preferred?: string): Promise<string> {
  if (preferred) {
    const rows = await listActiveServers();
    if (rows.some((s) => s.id === preferred)) return preferred;
  }
  const rows = await listActiveServers();
  return rows[0]?.id ?? (await getDefaultServerId());
}

function revalidateProtect() {
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/security");
  revalidatePath("/notifications");
  revalidatePath("/history");
}

export async function getProtectStatusAction(): Promise<{
  autoBlockEnabled: boolean;
  backupTriggerEnabled: boolean;
  backupTriggerCommand: string | null;
}> {
  const cmd = getBackupTriggerCommand();
  return {
    autoBlockEnabled: isAutoBlockEnabled(),
    backupTriggerEnabled: isBackupTriggerEnabled(),
    backupTriggerCommand: cmd || null,
  };
}

/** Manuell Backup-Job auf dem SSH-Host anstoßen (Opt-in via BACKUP_TRIGGER_COMMAND). */
export async function triggerBackupAction(
  serverId?: string,
): Promise<ProtectActionResult> {
  try {
    const id = await resolveServerId(serverId);
    const result = await runBackupTrigger(id);
    revalidateProtect();
    return { ok: result.ok, message: result.message };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Backup-Trigger fehlgeschlagen",
    };
  }
}
