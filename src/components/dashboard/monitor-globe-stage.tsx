"use client";

import Link from "next/link";
import { useRef } from "react";
import { MonitorGlobe, type MonitorGlobeHandle } from "./monitor-globe";
import { MonitorLiveActionSuffix } from "./monitor-live-action";
import { MonitorMatrixRain } from "./monitor-matrix-rain";
import { MonitorModeSwitch } from "./monitor-mode-switch";
import type { GlobeTint } from "@/lib/geo/attack-markers";

type Props = {
  globalStatus: "healthy" | "warning" | "critical";
  hostLabel: string;
  hostIp: string;
  checkMode: string;
  attackMarkers?: GlobeTint[];
  sessionMarkers?: GlobeTint[];
  webMarkers?: GlobeTint[];
  homeMarker?: GlobeTint | null;
};

export function MonitorGlobeStage({
  globalStatus,
  hostLabel,
  hostIp,
  checkMode,
  attackMarkers = [],
  sessionMarkers = [],
  webMarkers = [],
  homeMarker = null,
}: Props) {
  const globeRef = useRef<MonitorGlobeHandle>(null);

  return (
    <div className="monitor-wall monitor-wall--globe" data-status={globalStatus}>
      {/* BG wash only — globe outside so .monitor-bg opacity cannot dim it */}
      <div className="monitor-bg" aria-hidden>
        <div className="monitor-aurora" />
      </div>
      <div className="monitor-hud">
        <MonitorMatrixRain status={globalStatus} />
        <div className="monitor-hud-grid" />
        <div className="monitor-hud-rings monitor-hud-rings--focus">
          <MonitorGlobe
            ref={globeRef}
            status={globalStatus}
            interactive
            attackMarkers={attackMarkers}
            sessionMarkers={sessionMarkers}
            webMarkers={webMarkers}
            homeMarker={homeMarker}
          />
          <div className="monitor-hud-ring monitor-hud-ring--1" />
          <div className="monitor-hud-ring monitor-hud-ring--2" />
          <div className="monitor-hud-ring monitor-hud-ring--3" />
        </div>
        <div className="monitor-hud-scan" />
      </div>

      <div className="monitor-content monitor-content--globe">
        <header className="monitor-top">
          <div>
            <div className="monitor-brand">
              <strong>Globus</strong>
              {checkMode === "ssh" ? " · LIVE" : ""}
              <MonitorLiveActionSuffix />
            </div>
            <div className="monitor-host">
              {hostLabel} — {hostIp}
            </div>
            <p className="monitor-globe-hint">
              Ziehen · Scroll/Pinch zoom · Attack → Home · Hover
            </p>
          </div>
          <div className="monitor-top-right">
            <button
              type="button"
              className="monitor-globe-reset"
              onClick={() => globeRef.current?.resetView()}
            >
              Reset
            </button>
            <MonitorModeSwitch compact />
            <Link href="/" className="monitor-top-link">
              Dashboard
            </Link>
          </div>
        </header>
      </div>
    </div>
  );
}
