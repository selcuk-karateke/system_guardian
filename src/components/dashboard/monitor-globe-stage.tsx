import Link from "next/link";
import { MonitorGlobe } from "./monitor-globe";
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
  return (
    <div className="monitor-wall monitor-wall--globe" data-status={globalStatus}>
      {/* BG wash only — globe outside so .monitor-bg opacity cannot dim it */}
      <div className="monitor-bg" aria-hidden>
        <div className="monitor-aurora" />
      </div>
      <div className="monitor-hud">
        <div className="monitor-hud-grid" />
        <div className="monitor-hud-rings monitor-hud-rings--focus">
          <MonitorGlobe
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
            </div>
            <div className="monitor-host">
              {hostLabel} — {hostIp}
            </div>
            <p className="monitor-globe-hint">
              Ziehen · Scroll/Pinch zoom · Attack-Arcs → Home · Hover
            </p>
          </div>
          <div className="monitor-top-right">
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
