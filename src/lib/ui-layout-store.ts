import "server-only";

import { getSetting, setSetting } from "@/lib/app-settings";
import {
  defaultUiLayout,
  normalizeUiLayout,
  type UiLayout,
} from "@/lib/ui-layout";

function layoutKey(username: string): string {
  return `ui.layout.${username.trim().toLowerCase()}`;
}

export async function getUiLayoutForUser(
  username: string | null | undefined,
): Promise<UiLayout> {
  if (!username?.trim()) return defaultUiLayout();
  try {
    const stored = await getSetting<unknown>(layoutKey(username));
    if (stored == null) return defaultUiLayout();
    return normalizeUiLayout(stored);
  } catch {
    return defaultUiLayout();
  }
}

export async function setUiLayoutForUser(
  username: string,
  layout: UiLayout,
): Promise<void> {
  const normalized = normalizeUiLayout(layout);
  await setSetting(layoutKey(username), normalized);
}
