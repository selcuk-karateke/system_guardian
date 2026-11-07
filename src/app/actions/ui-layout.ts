"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { normalizeUiLayout, type UiLayout } from "@/lib/ui-layout";
import {
  getUiLayoutForUser,
  setUiLayoutForUser,
} from "@/lib/ui-layout-store";

export type UiLayoutActionResult = { ok: boolean; message: string };

/** Merge patch onto existing per-user layout (home or monitor partial OK). */
export async function saveUiLayoutAction(
  layout: UiLayout | Partial<UiLayout>,
): Promise<UiLayoutActionResult> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, message: "Nicht angemeldet — Layout lokal speichern" };
  }
  try {
    const prev = await getUiLayoutForUser(user);
    const merged = normalizeUiLayout({
      home: layout.home ?? prev.home,
      monitor: layout.monitor ?? prev.monitor,
    });
    await setUiLayoutForUser(user, merged);
    revalidatePath("/");
    revalidatePath("/monitor");
    return { ok: true, message: "Layout gespeichert" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Speichern fehlgeschlagen",
    };
  }
}
