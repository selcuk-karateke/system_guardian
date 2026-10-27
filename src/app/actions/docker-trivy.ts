"use server";

import { revalidatePath } from "next/cache";
import {
  getCheckMode,
  getTrivyScanLimit,
} from "@/lib/config";
import { runTrivyCheck } from "@/lib/checks/trivy";
import { runCheckWithPersist } from "@/lib/alerts/pipeline";
import { getDefaultServerId } from "@/lib/servers";
import { syncTrivyAlertsFromStore } from "@/lib/trivy/alerts";
import { mockScanContainerImage, scanContainerImage } from "@/lib/trivy/scan";
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
): Promise<TrivyScanResult> {
  const result =
    getCheckMode() === "mock"
      ? await mockScanContainerImage(containerName, imageRef)
      : await scanContainerImage(containerName, { force });

  if (result.ok) {
    const id = serverId || (await getDefaultServerId());
    await syncTrivyAlertsFromStore(id);
    revalidateTrivyViews();
  }

  return result;
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
 * Scannt eine Charge ungecachter Images und schreibt Alerts.
 * Gleicher Budget-Pfad wie Security-Cron (TRIVY_SCAN_LIMIT).
 */
export async function runTrivyBatchNowAction(
  serverId?: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const id = serverId || (await getDefaultServerId());
    const limit = getTrivyScanLimit();
    const result = await runCheckWithPersist(id, runTrivyCheck);
    revalidateTrivyViews();
    const findings = Number(
      (result.data as { imagesWithFindings?: number })?.imagesWithFindings ?? 0,
    );
    const scanned = Number(
      (result.data as { scannedThisRun?: number })?.scannedThisRun ?? 0,
    );
    return {
      ok: true,
      message: `Trivy-Batch: ${scanned}/${limit} gescannt, ${findings} Image(s) mit HIGH/CRIT → Warnungen`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Trivy-Batch fehlgeschlagen",
    };
  }
}
