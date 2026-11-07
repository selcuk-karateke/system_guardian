"use client";

import {
  Check,
  Cpu,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  X,
} from "lucide-react";
import { useState, useTransition } from "react";
import { saveUiLayoutAction } from "@/app/actions/ui-layout";
import { SgScrollRail } from "@/components/ui/sg-scroll-rail";
import {
  MODULE_LABELS,
  MONITOR_MODULE_ORDER,
  MONITOR_PLACEHOLDER_MODULES,
} from "@/lib/module-labels";
import {
  METRIC_ICONS,
  moduleIcon,
} from "@/lib/monitor/module-icons";
import {
  moveMetricOrder,
  type MetricOrderKey,
} from "@/lib/monitor/metric-order";
import { moveInOrder, type MonitorLayout, type UiLayout } from "@/lib/ui-layout";
import { patchLocalMonitor } from "@/lib/ui-layout-local";
import { notify, notifyResult } from "@/lib/ui/notify";

const METRIC_LABELS: Record<MetricOrderKey, string> = {
  load: "Load",
  ram: "RAM",
  disk: "Disk",
  uptime: "Uptime",
};

const PLACEHOLDERS = new Set<string>(MONITOR_PLACEHOLDER_MODULES);

const EDITABLE_MODULES = MONITOR_MODULE_ORDER.filter(
  (id) => !PLACEHOLDERS.has(id),
);

type Props = {
  layout: UiLayout;
  canPersist: boolean;
  onApplied: (monitor: MonitorLayout) => void;
  onClose: () => void;
};

export function MonitorLayoutEditor({
  layout,
  canPersist,
  onApplied,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<MonitorLayout>(() => ({
    ...layout.monitor,
    modules: layout.monitor.modules.filter((id) => !PLACEHOLDERS.has(id)),
  }));
  const [dragMetric, setDragMetric] = useState<MetricOrderKey | null>(null);
  const [dragModule, setDragModule] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const moduleRows = EDITABLE_MODULES.slice().sort((a, b) => {
    const ia = draft.modules.indexOf(a);
    const ib = draft.modules.indexOf(b);
    if (ia < 0 && ib < 0) return a.localeCompare(b);
    if (ia < 0) return 1;
    if (ib < 0) return -1;
    return ia - ib;
  });

  function toggleModule(id: string) {
    setDraft((prev) => {
      if (prev.modules.includes(id)) {
        return { ...prev, modules: prev.modules.filter((m) => m !== id) };
      }
      return { ...prev, modules: [...prev.modules, id] };
    });
  }

  function save() {
    startTransition(async () => {
      if (canPersist) {
        const r = await saveUiLayoutAction({ monitor: draft });
        notifyResult(r);
        if (!r.ok) return;
      } else {
        patchLocalMonitor(draft);
        notify({ message: "Layout gespeichert", tone: "ok" });
      }
      onApplied(draft);
      onClose();
    });
  }

  return (
    <div className="monitor-layout-editor" role="dialog" aria-label="Monitor-Layout">
      <div className="monitor-layout-editor-bar">
        <strong className="monitor-layout-editor-title">
          <LayoutGrid className="size-4" aria-hidden />
          <span>Layout</span>
        </strong>
        <div className="monitor-layout-editor-actions">
          <button
            type="button"
            className="monitor-layout-btn monitor-layout-btn--icon"
            onClick={onClose}
            disabled={pending}
            title="Abbrechen"
            aria-label="Abbrechen"
          >
            <X className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className="monitor-layout-btn monitor-layout-btn--primary monitor-layout-btn--icon"
            onClick={save}
            disabled={pending}
            title="Speichern"
            aria-label="Speichern"
          >
            <Check className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="monitor-layout-editor-cols">
        <section>
          <h3 title="Metrics">
            <Cpu className="size-3.5" aria-hidden />
          </h3>
          <ul>
            {draft.metrics.map((id) => {
              const Icon = METRIC_ICONS[id];
              return (
                <li
                  key={id}
                  className="monitor-layout-chip"
                  data-dragging={dragMetric === id ? "1" : undefined}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!dragMetric) return;
                    setDraft((prev) => ({
                      ...prev,
                      metrics: moveMetricOrder(prev.metrics, dragMetric, id),
                    }));
                    setDragMetric(null);
                  }}
                >
                  <span
                    className="monitor-layout-chip-label"
                    title={METRIC_LABELS[id]}
                  >
                    <Icon className="size-4 shrink-0 text-[var(--hud-cyan)]" aria-hidden />
                    <span className="monitor-layout-chip-text">
                      {METRIC_LABELS[id]}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="monitor-layout-grip"
                    draggable
                    title="Verschieben"
                    aria-label={`${METRIC_LABELS[id]} verschieben`}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", id);
                      setDragMetric(id);
                    }}
                    onDragEnd={() => setDragMetric(null)}
                  >
                    <GripVertical aria-hidden className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="monitor-layout-editor-mod">
          <h3 title="Module">
            <LayoutGrid className="size-3.5" aria-hidden />
          </h3>
          <SgScrollRail className="monitor-layout-editor-rail" step={120}>
            <ul>
              {moduleRows.map((id) => {
                const on = draft.modules.includes(id);
                const Icon = moduleIcon(id);
                const label = MODULE_LABELS[id] ?? id;
                return (
                  <li
                    key={id}
                    className="monitor-layout-chip"
                    data-off={on ? undefined : "1"}
                    data-dragging={dragModule === id ? "1" : undefined}
                    onDragOver={(e) => {
                      if (on) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (!dragModule || !on) return;
                      setDraft((prev) => ({
                        ...prev,
                        modules: moveInOrder(prev.modules, dragModule, id),
                      }));
                      setDragModule(null);
                    }}
                  >
                    <button
                      type="button"
                      className="monitor-layout-vis"
                      title={on ? "Ausblenden" : "Einblenden"}
                      aria-label={`${label} ${on ? "ausblenden" : "einblenden"}`}
                      aria-pressed={on}
                      onClick={() => toggleModule(id)}
                    >
                      {on ? (
                        <Eye className="size-4" aria-hidden />
                      ) : (
                        <EyeOff className="size-4" aria-hidden />
                      )}
                    </button>
                    <span
                      className="monitor-layout-chip-label"
                      title={label}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="monitor-layout-chip-text">{label}</span>
                    </span>
                    {on ? (
                      <button
                        type="button"
                        className="monitor-layout-grip"
                        draggable
                        title="Verschieben"
                        aria-label={`${label} verschieben`}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", id);
                          setDragModule(id);
                        }}
                        onDragEnd={() => setDragModule(null)}
                      >
                        <GripVertical aria-hidden className="size-4" />
                      </button>
                    ) : (
                      <span
                        className="monitor-layout-grip monitor-layout-grip--off"
                        aria-hidden
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </SgScrollRail>
        </section>
      </div>
    </div>
  );
}
