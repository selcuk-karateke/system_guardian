"use client";

import Link from "next/link";
import { Check, LayoutDashboard, LayoutGrid } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { CrisisStage } from "@/lib/crisis/stages";
import { applyModuleLayout } from "@/lib/monitor/module-layout";
import type {
  MetricToneThresholds,
  MonitorLiveHostVitals,
  MonitorMetricCards,
} from "@/lib/monitor-metric-cards";
import type { MetricOrderKey } from "@/lib/monitor/metric-order";
import type { MonitorLayout, UiLayout } from "@/lib/ui-layout";
import { readLocalUiLayout } from "@/lib/ui-layout-local";
import { MonitorClock } from "./monitor-clock";
import { MonitorLayoutEditor } from "./monitor-layout-editor";
import { MonitorLivePanel } from "./monitor-live-panel";
import { MonitorModeSwitch } from "./monitor-mode-switch";
import {
  MonitorModuleGrid,
  type MonitorModuleSection,
} from "./monitor-module-grid";
import { MonitorReloadButton } from "./monitor-reload-button";
import type { MonitorEgressInfo } from "./monitor-status-band";
import {
  ServerSelect,
  type ServerSelectOption,
} from "./server-select";

type TileSeverity = CrisisStage | "ok" | "unknown";

type Props = {
  initialLayout: UiLayout;
  canPersist: boolean;
  catalogSections: readonly MonitorModuleSection[];
  wallTone: "healthy" | "warning" | "critical";
  crisisStage: CrisisStage | null;
  hero: string;
  counts: { ok: number; s4: number; s3: number; s2: number; s1: number };
  lastCheck: Date | null;
  serverId?: string | null;
  servers?: ServerSelectOption[];
  hostLabel: string;
  hostIp: string;
  hostMeta?: string | null;
  checkMode: string;
  initial: { egress: MonitorEgressInfo | null; host: MonitorLiveHostVitals | null };
  metricCards: MonitorMetricCards;
  cpuCores?: number | null;
  toneThresholds?: MetricToneThresholds;
  severityMap: Record<string, TileSeverity>;
  moduleDetails: Record<string, string[]>;
};

export function MonitorCustomArea({
  initialLayout,
  canPersist,
  catalogSections,
  wallTone,
  crisisStage,
  hero,
  counts,
  lastCheck,
  serverId = null,
  servers = [],
  hostLabel,
  hostIp,
  hostMeta = null,
  checkMode,
  initial,
  metricCards,
  cpuCores = null,
  toneThresholds,
  severityMap,
  moduleDetails,
}: Props) {
  const [layout, setLayout] = useState(initialLayout);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (canPersist) {
      setLayout(initialLayout);
      return;
    }
    setLayout(readLocalUiLayout());
  }, [canPersist, initialLayout]);

  const sections = useMemo(
    () => applyModuleLayout(catalogSections, layout.monitor.modules),
    [catalogSections, layout.monitor.modules],
  );

  function onMetricOrderChange(metrics: MetricOrderKey[]) {
    setLayout((prev) => ({
      ...prev,
      monitor: { ...prev.monitor, metrics },
    }));
  }

  function onMonitorApplied(monitor: MonitorLayout) {
    setLayout((prev) => ({ ...prev, monitor }));
  }

  return (
    <div className="monitor-custom-area">
      <header className="monitor-top">
        <div>
          <div className="monitor-brand">
            <strong>System Guardian</strong>
            {checkMode === "ssh" ? " · LIVE" : ""}
          </div>
          <div className="monitor-host">
            {hostLabel} — {hostIp}
          </div>
          {hostMeta ? (
            <div className="monitor-host-meta">{hostMeta}</div>
          ) : null}
        </div>
        <div className="monitor-top-right">
          {servers.length > 1 && serverId ? (
            <Suspense fallback={null}>
              <ServerSelect
                servers={servers}
                selectedId={serverId}
                className="monitor-top-select monitor-top-select--quiet"
              />
            </Suspense>
          ) : null}
          <MonitorModeSwitch compact />
          <MonitorClock />
          <MonitorReloadButton />
          <button
            type="button"
            className="monitor-reload-btn monitor-reload-btn--icon"
            onClick={() => setEditing((v) => !v)}
            aria-pressed={editing}
            title={editing ? "Layout fertig" : "Layout bearbeiten"}
            aria-label={editing ? "Layout fertig" : "Layout bearbeiten"}
          >
            {editing ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <LayoutGrid className="size-3.5" aria-hidden />
            )}
          </button>
          <Link
            href="/"
            className="monitor-top-link monitor-top-link--icon"
            title="Dashboard"
            aria-label="Dashboard"
          >
            <LayoutDashboard className="size-3.5" aria-hidden />
          </Link>
        </div>
      </header>

      {editing ? (
        <MonitorLayoutEditor
          layout={layout}
          canPersist={canPersist}
          onApplied={onMonitorApplied}
          onClose={() => setEditing(false)}
        />
      ) : null}

      <MonitorLivePanel
        wallTone={wallTone}
        crisisStage={crisisStage}
        hero={hero}
        counts={counts}
        lastCheck={lastCheck}
        serverId={serverId}
        initial={initial}
        metricCards={metricCards}
        cpuCores={cpuCores}
        toneThresholds={toneThresholds}
        metricOrder={layout.monitor.metrics}
        onMetricOrderChange={onMetricOrderChange}
        canPersistMetrics={canPersist}
        fullLayout={layout}
        layoutEditing={editing}
      />

      <MonitorModuleGrid
        sections={sections}
        severityMap={severityMap}
        moduleDetails={moduleDetails}
        visibleRows={3}
        secondsPerRow={3.5}
        layoutEditing={editing}
      />
    </div>
  );
}
