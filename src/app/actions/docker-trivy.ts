"use server";

import { revalidatePath } from "next/cache";
import { getCheckMode } from "@/lib/config";
import { runTrivyCheck } from "@/lib/checks/trivy";
import {
  runCheckWithPersist,
  serverIdCondition,
} from "@/lib/alerts/pipeline";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { refreshDockerInventory } from "@/lib/docker/refresh";
import { getDefaultServerId } from "@/lib/servers";
import { syncTrivyAlertsFromStore } from "@/lib/trivy/alerts";
import { mockScanContainerImage, scanContainerImage } from "@/lib/trivy/scan";
import { clearAllTrivyScans } from "@/lib/trivy/store";
import type { TrivyScanResult } from "@/lib/trivy/types";

function revalidateTrivyViews() {
  revalidatePath("/docker");
  revalidatePath("/");
  revalidatePath("/notifications");
  revalidatePath("/monitor");
  revalidatePath("/security");
}

export async function runContainerTrivyScan(
  containerName: string,
  imageRef: string,
  force = false,
  serverId?: string,
  coolifyUuid?: string | null,
): Promise<TrivyScanResult> {
  try {
    const id = serverId || (await getDefaultServerId());

    // After Coolify Dockerfile rebuild the container name suffix changes —
    // pull fresh docker ps so remap + page refresh see the live name.
    if (getCheckMode() === "ssh") {
      await refreshDockerInventory(id).catch(() => null);
    }

    const result =
      getCheckMode() === "mock"
        ? await mockScanContainerImage(containerName, imageRef)
        : await scanContainerImage(containerName, {
            force,
            serverId: id,
            coolifyUuid,
          });

    if (result.ok) {
      // Notify channels can throw (Telegram ECONNRESET) — scan result still valid.
      await syncTrivyAlertsFromStore(id).catch((e) => {
        console.warn(
          "[trivy] alert sync failed:",
          e instanceof Error ? e.message : e,
        );
      });
      revalidateTrivyViews();
    } else if (getCheckMode() === "ssh") {
      // Still refresh list when name was stale so UI drops ghost rows.
      revalidateTrivyViews();
    }

    return result;
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Trivy-Scan fehlgeschlagen";
    return { ok: false, message: message.slice(0, 300) };
  }
}

/** Cached Findings → Dashboard-Warnungen (ohne neuen Scan). */
export async function syncTrivyAlertsAction(
  serverId?: string,
): Promise<{ ok: boolean; alertCount: number; message: string }> {
  try {
    const id = serverId || (await getDefaultServerId());
    const alerts = await syncTrivyAlertsFromStore(id);
    revalidateTrivyViews();
    return {
      ok: true,
      alertCount: alerts.length,
      message: `${alerts.length} Trivy-Warnung(en) auf dem Dashboard`,
    };
  } catch (e) {
    return {
      ok: false,
      alertCount: 0,
      message: e instanceof Error ? e.message : "Sync fehlgeschlagen",
    };
  }
}

/**
 * Scannt eine Charge ungecachter/alter Images und schreibt Alerts.
 * Gleicher Budget-Pfad wie Security-Cron (TRIVY_SCAN_LIMIT).
 */
export async function runTrivyBatchNowAction(
  serverId?: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const id = serverId || (await getDefaultServerId());
    // Manual click: always scan, full budget (20) — cron stays at TRIVY_SCAN_LIMIT.
    const result = await runCheckWithPersist(id, (sid) =>
      runTrivyCheck(sid, { forceScan: true, scanLimit: 20 }),
    );
    revalidateTrivyViews();
    const data = result.data as {
      imagesWithFindings?: number;
      scannedThisRun?: number;
      stillPending?: number;
      cachedImages?: number;
      scanErrors?: string[];
    };
    const scanned = Number(data.scannedThisRun ?? 0);
    const pending = Number(data.stillPending ?? 0);
    const errs = data.scanErrors?.length ?? 0;
    let message =
      pending > 0
        ? `${scanned} neu gescannt · noch ${pending} offen → Scannen nochmal`
        : scanned > 0
          ? `${scanned} neu gescannt · alles drin`
          : "Nichts Neues — alles schon gescannt";
    if (errs > 0) message += ` · ${errs} Fehler`;
    return { ok: true, message };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Scan fehlgeschlagen",
    };
  }
}

/**
 * Scan-Cache komplett leeren + alle offenen Trivy-Alerts schließen.
 * Die Docker-Liste zeigt danach „nicht gescannt“ — erst „2 · Scannen“ füllt neu.
 */
export async function resetTrivyStateAction(
  serverId?: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const id = serverId || (await getDefaultServerId());
    const cleared = await clearAllTrivyScans();

    const open = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.module, "trivy"),
          isNull(alerts.resolvedAt),
          serverIdCondition(id),
        ),
      );
    const now = new Date();
    for (const row of open) {
      await db
        .update(alerts)
        .set({
          resolvedAt: now,
          recommendation: "Manuell: Trivy-Reset (Scan-Cache geleert)",
        })
        .where(eq(alerts.id, row.id));
    }

    // Empty store → no new alerts
    await syncTrivyAlertsFromStore(id);
    revalidateTrivyViews();
    return {
      ok: true,
      message: `Reset fertig: ${cleared} Scan(s) und ${open.length} Alert(s) weg. Liste = „nicht gescannt“ bis du wieder scannst.`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Reset fehlgeschlagen",
    };
  }
}
