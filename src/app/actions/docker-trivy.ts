"use server";

import { revalidatePath } from "next/cache";
import { getCheckMode } from "@/lib/config";
import { mockScanContainerImage, scanContainerImage } from "@/lib/trivy/scan";
import type { TrivyScanResult } from "@/lib/trivy/types";

export async function runContainerTrivyScan(
  containerName: string,
  imageRef: string,
  force = false,
): Promise<TrivyScanResult> {
  const result =
    getCheckMode() === "mock"
      ? await mockScanContainerImage(containerName, imageRef)
      : await scanContainerImage(containerName, { force });

  if (result.ok) {
    revalidatePath("/docker");
  }

  return result;
}
