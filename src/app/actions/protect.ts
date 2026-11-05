"use server";

import { revalidatePath } from "next/cache";
import { isAutoBlockEnabled } from "@/lib/config";
import { enqueueBackgroundJob } from "@/lib/jobs/enqueue";
import type { EnqueueResult } from "@/lib/jobs/types";
import { runBackupTrigger } from "@/lib/protect/backup-trigger";
import { triggerCoolifyForceRedeploy } from "@/lib/protect/coolify-redeploy";
import { resolveBackupConfig } from "@/lib/servers-backup";
import {
  isCoolifyRedeployConfiguredForServer,
  resolveCoolifyApi,
} from "@/lib/servers-coolify";
import { getDefaultServerId, listActiveServers } from "@/lib/servers";

export type ProtectActionResult = EnqueueResult | { ok: false; message: string };

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

export async function getProtectStatusAction(
  serverId?: string,
): Promise<{
  autoBlockEnabled: boolean;
  backupTriggerEnabled: boolean;
  backupTriggerCommand: string | null;
  coolifyRedeployConfigured: boolean;
  coolifyApiUrl: string | null;
}> {
  const id = await resolveServerId(serverId);
  const [backup, coolify] = await Promise.all([
    resolveBackupConfig(id),
    resolveCoolifyApi(id),
  ]);
  return {
    autoBlockEnabled: isAutoBlockEnabled(),
    backupTriggerEnabled: Boolean(backup.triggerCommand),
    backupTriggerCommand: backup.triggerCommand || null,
    coolifyRedeployConfigured: Boolean(coolify),
    coolifyApiUrl: coolify?.url ?? null,
  };
}

/** Manuell Backup-Job auf dem SSH-Host anstoßen. */
export async function triggerBackupAction(
  serverId?: string,
): Promise<ProtectActionResult> {
  try {
    const id = await resolveServerId(serverId);
    return enqueueBackgroundJob(
      { kind: "backup", label: "Backup", serverId: id },
      async () => {
        const result = await runBackupTrigger(id);
        revalidateProtect();
        if (!result.ok) throw new Error(result.message);
        return result.message;
      },
    );
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Backup-Trigger fehlgeschlagen",
    };
  }
}

/** Coolify Force-Rebuild (ohne Build-Cache). */
export async function triggerCoolifyRedeployAction(
  resourceUuid: string,
  serverId?: string,
): Promise<ProtectActionResult> {
  try {
    const id = await resolveServerId(serverId);
    const ready = await isCoolifyRedeployConfiguredForServer(id);
    if (!ready) {
      return {
        ok: false,
        message:
          "Coolify-API nicht konfiguriert — Einstellungen → Server → Coolify",
      };
    }
    const short = resourceUuid.slice(0, 8);
    return enqueueBackgroundJob(
      {
        kind: "redeploy",
        label: "Coolify Redeploy",
        serverId: id,
        detail: short,
      },
      async () => {
        const result = await triggerCoolifyForceRedeploy(id, resourceUuid, "ui");
        if (result.ok) {
          const { refreshDockerInventory } = await import(
            "@/lib/docker/refresh"
          );
          await refreshDockerInventory(id).catch(() => null);
        }
        revalidateProtect();
        if (!result.ok) throw new Error(result.message);
        return `${result.message} · Warte bis Coolify-Deploy grün, dann Inventar/Scan Neu`;
      },
    );
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error ? e.message : "Coolify-Redeploy fehlgeschlagen",
    };
  }
}
