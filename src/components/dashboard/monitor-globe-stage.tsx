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

/** Client poll — sats re-propagate locally; OpenSky is server-cached/backed-off. */
const SKY_POLL_MS = 30_000;

const LAYERS = [
  { id: "cable", label: "Kabel", title: "Seekabel", key: "cables" as const },
  { id: "pipe", label: "Pipelines", title: "Öl/Gas", key: "pipelines" as const },
  {
    id: "plate",
    label: "Platten",
    title: "Tektonik · Grenzen",
    key: "plates" as const,
  },
  {
    id: "flight",
    label: "Flieger",
    title: "~10 km",
    key: "flights" as const,
  },
  {
    id: "sat",
    label: "Orbit",
    title: "LEO · MEO · GEO",
    key: "sats" as const,
  },
  {
    id: "astro",
    label: "Sonne",
    title: "Sonne/Mond · Richtung",
    key: "astro" as const,
  },
] as const;

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
  const [showPlates, setShowPlates] = useState(true);
  const [showSats, setShowSats] = useState(true);
  const [showFlights, setShowFlights] = useState(true);
  const [showAstro, setShowAstro] = useState(true);
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
    sky?.flightsSource === "live" && sky.flights.length > 0
      ? sky.flights
      : null;
  const liveSatellites =
    sky?.satellitesSource === "live" && sky.satellites.length > 0
      ? sky.satellites
      : null;
  const skyLive =
    liveFlights != null && liveSatellites != null
      ? " · SKY"
      : liveFlights != null
        ? " · AIR"
        : liveSatellites != null
          ? " · SAT"
          : sky
            ? " · …"
            : "";
  const openskyCredits =
    sky?.openskyRemaining != null
      ? ` · OS ${sky.openskyRemaining}`
      : sky?.flightsSource === "unavailable" && sky.error
        ? " · OS—"
        : "";

  const layerOn = {
    cables: showCables,
    pipelines: showPipelines,
    plates: showPlates,
    flights: showFlights,
    sats: showSats,
    astro: showAstro,
  };
  const toggleLayer = {
    cables: () => setShowCables((v) => !v),
    pipelines: () => setShowPipelines((v) => !v),
    plates: () => setShowPlates((v) => !v),
    flights: () => setShowFlights((v) => !v),
    sats: () => setShowSats((v) => !v),
    astro: () => setShowAstro((v) => !v),
  };

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
            showPlates={showPlates}
            showSats={showSats}
            showFlights={showFlights}
            showAstro={showAstro}
            liveFlights={liveFlights}
            liveFlightsAt={liveFlights ? sky?.at ?? null : null}
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
        <header className="monitor-top monitor-top--globe">
          <div className="monitor-globe-head">
            <div className="monitor-brand">
              <strong>Globus</strong>
              {checkMode === "ssh" ? " · LIVE" : ""}
              {skyLive}
              {openskyCredits}
              <MonitorLiveActionSuffix />
            </div>
            <div className="monitor-host">
              {hostLabel} — {hostIp}
            </div>
            <div className="monitor-globe-layers" role="group" aria-label="Layer">
              {LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  className={`monitor-globe-layer monitor-globe-layer--${layer.id}`}
                  data-on={layerOn[layer.key] ? "1" : "0"}
                  aria-pressed={layerOn[layer.key]}
                  title={layer.title}
                  onClick={toggleLayer[layer.key]}
                >
                  <span className="monitor-globe-layer-dot" aria-hidden />
                  {layer.label}
                </button>
              ))}
            </div>
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
