import {
  METRIC_ORDER_KEYS,
  normalizeMetricOrder,
  type MetricOrderKey,
} from "@/lib/monitor/metric-order";
import {
  MONITOR_MODULE_ORDER,
  MONITOR_PLACEHOLDER_MODULES,
} from "@/lib/module-labels";

const PLACEHOLDER_MODULES = new Set<string>(MONITOR_PLACEHOLDER_MODULES);

const DEFAULT_MONITOR_MODULES = MONITOR_MODULE_ORDER.filter(
  (id) => !PLACEHOLDER_MODULES.has(id),
);

export const HOME_WIDGET_IDS = ["servers", "alerts"] as const;
export type HomeWidgetId = (typeof HOME_WIDGET_IDS)[number];

export type HomeLayout = {
  order: HomeWidgetId[];
  hidden: HomeWidgetId[];
};

export type MonitorLayout = {
  metrics: MetricOrderKey[];
  /** Visible modules in display order (hidden = omitted). */
  modules: string[];
};

export type UiLayout = {
  home: HomeLayout;
  monitor: MonitorLayout;
};

function isHomeWidgetId(v: unknown): v is HomeWidgetId {
  return (
    typeof v === "string" &&
    (HOME_WIDGET_IDS as readonly string[]).includes(v)
  );
}

export function defaultHomeLayout(): HomeLayout {
  return {
    order: [...HOME_WIDGET_IDS],
    hidden: [],
  };
}

export function defaultMonitorLayout(): MonitorLayout {
  return {
    metrics: [...METRIC_ORDER_KEYS],
    modules: [...DEFAULT_MONITOR_MODULES],
  };
}

export function defaultUiLayout(): UiLayout {
  return {
    home: defaultHomeLayout(),
    monitor: defaultMonitorLayout(),
  };
}

export function normalizeHomeLayout(raw: unknown): HomeLayout {
  const base = defaultHomeLayout();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const seen = new Set<HomeWidgetId>();
  const order: HomeWidgetId[] = [];
  if (Array.isArray(o.order)) {
    for (const id of o.order) {
      if (isHomeWidgetId(id) && !seen.has(id)) {
        seen.add(id);
        order.push(id);
      }
    }
  }
  for (const id of HOME_WIDGET_IDS) {
    if (!seen.has(id)) order.push(id);
  }
  const hidden: HomeWidgetId[] = [];
  if (Array.isArray(o.hidden)) {
    for (const id of o.hidden) {
      if (isHomeWidgetId(id) && !hidden.includes(id)) hidden.push(id);
    }
  }
  return { order, hidden };
}

export function normalizeMonitorLayout(raw: unknown): MonitorLayout {
  const base = defaultMonitorLayout();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const metrics = normalizeMetricOrder(o.metrics);
  const allowed = new Set<string>(DEFAULT_MONITOR_MODULES);
  const modules: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(o.modules)) {
    for (const id of o.modules) {
      if (
        typeof id !== "string" ||
        !allowed.has(id) ||
        PLACEHOLDER_MODULES.has(id) ||
        seen.has(id)
      ) {
        continue;
      }
      seen.add(id);
      modules.push(id);
    }
  }
  // Empty modules array means "use default full set" only when raw omitted modules.
  // Explicit empty = hide all; if key missing, fill defaults.
  if (!Array.isArray(o.modules)) {
    return { metrics, modules: base.modules };
  }
  return { metrics, modules };
}

export function normalizeUiLayout(raw: unknown): UiLayout {
  if (!raw || typeof raw !== "object") return defaultUiLayout();
  const o = raw as Record<string, unknown>;
  return {
    home: normalizeHomeLayout(o.home),
    monitor: normalizeMonitorLayout(o.monitor),
  };
}

export function moveInOrder<T extends string>(
  order: T[],
  from: T,
  to: T,
): T[] {
  if (from === to) return order;
  const next = [...order];
  const fromIdx = next.indexOf(from);
  const toIdx = next.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return order;
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, from);
  return next;
}
