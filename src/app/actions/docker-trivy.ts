"use server";

import { revalidatePath } from "next/cache";
import { getCheckMode } from "@/lib/config";
import { getDefaultServerId } from "@/lib/servers";
import { syncTrivyAlertsFromStore } from "@/lib/trivy/alerts";
import { mockScanContainerImage, scanContainerImage } from "@/lib/trivy/scan";
import type { TrivyScanResult } from "@/lib/trivy/types";

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
    revalidatePath("/docker");
    revalidatePath("/");
    revalidatePath("/notifications");
    revalidatePath("/monitor");
    revalidatePath("/security");
  }

  return result;
}
