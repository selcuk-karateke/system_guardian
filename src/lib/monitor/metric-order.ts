/** Browser-local order of TV metric cards (Load / RAM / Disk / Uptime). */

export const METRIC_ORDER_KEYS = ["load", "ram", "disk", "uptime"] as const;
export type MetricOrderKey = (typeof METRIC_ORDER_KEYS)[number];

export const METRIC_ORDER_STORAGE_KEY = "sg-monitor-metric-order";

const DEFAULT_ORDER: readonly MetricOrderKey[] = [...METRIC_ORDER_KEYS];

function isMetricOrderKey(v: unknown): v is MetricOrderKey {
  return (
    typeof v === "string" &&
    (METRIC_ORDER_KEYS as readonly string[]).includes(v)
  );
}

/** Normalize to a full permutation of the four cards. */
export function normalizeMetricOrder(
  raw: unknown,
): MetricOrderKey[] {
  const seen = new Set<MetricOrderKey>();
  const out: MetricOrderKey[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (isMetricOrderKey(item) && !seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    }
  }
  for (const key of DEFAULT_ORDER) {
    if (!seen.has(key)) out.push(key);
  }
  return out;
}

export function readMetricOrder(): MetricOrderKey[] {
  if (typeof window === "undefined") return [...DEFAULT_ORDER];
  try {
    const raw = window.localStorage.getItem(METRIC_ORDER_STORAGE_KEY);
    if (!raw) return [...DEFAULT_ORDER];
    return normalizeMetricOrder(JSON.parse(raw) as unknown);
  } catch {
    return [...DEFAULT_ORDER];
  }
}

export function writeMetricOrder(order: MetricOrderKey[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      METRIC_ORDER_STORAGE_KEY,
      JSON.stringify(normalizeMetricOrder(order)),
    );
  } catch {
    /* private mode */
  }
}

export function moveMetricOrder(
  order: MetricOrderKey[],
  from: MetricOrderKey,
  to: MetricOrderKey,
): MetricOrderKey[] {
  if (from === to) return order;
  const next = [...order];
  const fromIdx = next.indexOf(from);
  const toIdx = next.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return order;
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, from);
  return next;
}
