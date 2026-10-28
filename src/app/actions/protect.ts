"use server";

import { revalidatePath } from "next/cache";
import {
  getBackupTriggerCommand,
  getCoolifyApiUrl,
  isAutoBlockEnabled,
  isBackupTriggerEnabled,
  isCoolifyRedeployConfigured,
} from "@/lib/config";
import { runBackupTrigger } from "@/lib/protect/backup-trigger";
import { triggerCoolifyForceRedeploy } from "@/lib/protect/coolify-redeploy";
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
  revalidatePath("/docker");
}

export async function getProtectStatusAction(): Promise<{
  autoBlockEnabled: boolean;
  backupTriggerEnabled: boolean;
  backupTriggerCommand: string | null;
  coolifyRedeployConfigured: boolean;
  coolifyApiUrl: string | null;
}> {
  const cmd = getBackupTriggerCommand();
  return {
    autoBlockEnabled: isAutoBlockEnabled(),
    backupTriggerEnabled: isBackupTriggerEnabled(),
    backupTriggerCommand: cmd || null,
    coolifyRedeployConfigured: isCoolifyRedeployConfigured(),
    coolifyApiUrl: getCoolifyApiUrl(),
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

/** Coolify Force-Rebuild (ohne Build-Cache). Braucht COOLIFY_API_URL + TOKEN. */
export async function triggerCoolifyRedeployAction(
  resourceUuid: string,
  serverId?: string,
): Promise<ProtectActionResult> {
  try {
    const id = await resolveServerId(serverId);
    const result = await triggerCoolifyForceRedeploy(
      id,
      resourceUuid,
      "ui",
    );
    // Dockerfile rebuild swaps container name (uuid-oldId → uuid-newId).
    // Refresh inventory so Scan can resolve the live name by Coolify UUID.
    if (result.ok) {
      const { refreshDockerInventory } = await import("@/lib/docker/refresh");
      await refreshDockerInventory(id).catch(() => null);
    }
    revalidateProtect();
    const hint = result.ok
      ? " · Warte bis Coolify-Deploy grün, dann Inventar/Scan Neu (Name ändert sich nach Dockerfile-Build)"
      : "";
    return { ok: result.ok, message: `${result.message}${hint}` };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error ? e.message : "Coolify-Redeploy fehlgeschlagen",
    };
  }
}
