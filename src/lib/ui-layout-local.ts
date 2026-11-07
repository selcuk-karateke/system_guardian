/** Browser fallback when auth is off / not logged in. */

import {
  defaultUiLayout,
  normalizeUiLayout,
  type HomeLayout,
  type MonitorLayout,
  type UiLayout,
} from "@/lib/ui-layout";
import {
  METRIC_ORDER_STORAGE_KEY,
  normalizeMetricOrder,
  writeMetricOrder,
} from "@/lib/monitor/metric-order";

export const UI_LAYOUT_STORAGE_KEY = "sg-ui-layout";

export function readLocalUiLayout(): UiLayout {
  if (typeof window === "undefined") return defaultUiLayout();
  try {
    const raw = window.localStorage.getItem(UI_LAYOUT_STORAGE_KEY);
    if (raw) return normalizeUiLayout(JSON.parse(raw) as unknown);
    // Migrate legacy metric-only key
    const legacy = window.localStorage.getItem(METRIC_ORDER_STORAGE_KEY);
    const base = defaultUiLayout();
    if (legacy) {
      base.monitor.metrics = normalizeMetricOrder(JSON.parse(legacy));
    }
    return base;
  } catch {
    return defaultUiLayout();
  }
}

export function writeLocalUiLayout(layout: UiLayout): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeUiLayout(layout);
  try {
    window.localStorage.setItem(
      UI_LAYOUT_STORAGE_KEY,
      JSON.stringify(normalized),
    );
    writeMetricOrder(normalized.monitor.metrics);
  } catch {
    /* private mode */
  }
}

export function patchLocalHome(home: HomeLayout): UiLayout {
  const next = { ...readLocalUiLayout(), home };
  writeLocalUiLayout(next);
  return next;
}

export function patchLocalMonitor(monitor: MonitorLayout): UiLayout {
  const next = { ...readLocalUiLayout(), monitor };
  writeLocalUiLayout(next);
  return next;
}
