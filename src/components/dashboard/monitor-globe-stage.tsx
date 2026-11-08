"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MonitorGlobe, type MonitorGlobeHandle } from "./monitor-globe";
import { MonitorLiveActionSuffix } from "./monitor-live-action";
import { MonitorMatrixRain } from "./monitor-matrix-rain";
import { MonitorModeSwitch } from "./monitor-mode-switch";
import type { GlobeTint } from "@/lib/geo/attack-markers";
import type { LiveSkyPayload } from "@/lib/geo/live-sky";

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

const SKY_POLL_MS = 15_000;

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
  const [showCables, setShowCables] = useState(true);
  const [showPipelines, setShowPipelines] = useState(true);
  const [showSats, setShowSats] = useState(true);
  const [showFlights, setShowFlights] = useState(true);
  const [sky, setSky] = useState<LiveSkyPayload | null>(null);

  useEffect(() => {
    let dead = false;
    const pull = async () => {
      try {
        const res = await fetch("/api/monitor/sky", { cache: "no-store" });
        const json = (await res.json()) as LiveSkyPayload;
        if (!dead) setSky(json);
      } catch {
        /* keep last good / demo fallback */
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), SKY_POLL_MS);
    return () => {
      dead = true;
      window.clearInterval(id);
    };
  }, []);

  const liveFlights =
    sky?.flightsSource === "live" ? sky.flights : null;
  const liveSatellites =
    sky?.satellitesSource === "live" ? sky.satellites : null;
  const skyLive =
    liveFlights != null || liveSatellites != null
      ? " · SKY LIVE"
      : sky
        ? " · SKY …"
        : "";

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
            showCables={showCables}
            showPipelines={showPipelines}
            showSats={showSats}
            showFlights={showFlights}
            liveFlights={liveFlights}
            liveSatellites={liveSatellites}
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
              {skyLive}
              <MonitorLiveActionSuffix />
            </div>
            <div className="monitor-host">
              {hostLabel} — {hostIp}
            </div>
            <p className="monitor-globe-hint">
              Ziehen · Zoom · Live Flieger/Orbit · Hover · Attack → Home
            </p>
          </div>
          <div className="monitor-top-right">
            <div className="monitor-globe-layers" role="group" aria-label="Layer">
              <button
                type="button"
                className="monitor-globe-layer monitor-globe-layer--cable"
                data-on={showCables ? "1" : "0"}
                aria-pressed={showCables}
                onClick={() => setShowCables((v) => !v)}
              >
                Kabel
              </button>
              <button
                type="button"
                className="monitor-globe-layer monitor-globe-layer--pipe"
                data-on={showPipelines ? "1" : "0"}
                aria-pressed={showPipelines}
                onClick={() => setShowPipelines((v) => !v)}
              >
                Pipelines
              </button>
              <button
                type="button"
                className="monitor-globe-layer monitor-globe-layer--flight"
                data-on={showFlights ? "1" : "0"}
                aria-pressed={showFlights}
                onClick={() => setShowFlights((v) => !v)}
              >
                Flieger
              </button>
              <button
                type="button"
                className="monitor-globe-layer monitor-globe-layer--sat"
                data-on={showSats ? "1" : "0"}
                aria-pressed={showSats}
                onClick={() => setShowSats((v) => !v)}
              >
                Orbit
              </button>
            </div>
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
