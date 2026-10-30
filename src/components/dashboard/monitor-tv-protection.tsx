"use client";

import { useCallback, useEffect, useState } from "react";

type Props = {
  children: React.ReactNode;
  globalStatus: "healthy" | "warning" | "critical";
  /** Wake night mode on S1/S2 (Severe/Emergency). */
  crisisStage?: 1 | 2 | 3 | 4 | null;
  nightStartHour: number;
  nightEndHour: number;
  pixelShiftSec: number;
  nightModeEnabled: boolean;
  wakeMinutes?: number;
};

function isNightHour(now: Date, start: number, end: number): boolean {
  const h = now.getHours();
  if (start === end) return false;
  if (start > end) return h >= start || h < end;
  return h >= start && h < end;
}

export function MonitorTvProtection({
  children,
  globalStatus,
  crisisStage = null,
  nightStartHour,
  nightEndHour,
  pixelShiftSec,
  nightModeEnabled,
  wakeMinutes = 10,
}: Props) {
  const [pixelShift, setPixelShift] = useState(0);
  const [awakeUntil, setAwakeUntil] = useState(0);
  const [now, setNow] = useState(() => new Date());

  const wake = useCallback(() => {
    setAwakeUntil(Date.now() + wakeMinutes * 60_000);
  }, [wakeMinutes]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const id = setInterval(
      () => setPixelShift((s) => (s + 1) % 4),
      pixelShiftSec * 1000,
    );
    return () => clearInterval(id);
  }, [pixelShiftSec]);

  useEffect(() => {
    const onWake = () => wake();
    window.addEventListener("pointermove", onWake, { passive: true });
    window.addEventListener("keydown", onWake);
    return () => {
      window.removeEventListener("pointermove", onWake);
      window.removeEventListener("keydown", onWake);
    };
  }, [wake]);

  const inNightWindow =
    nightModeEnabled && isNightHour(now, nightStartHour, nightEndHour);
  const isAwake = Date.now() < awakeUntil;
  const mustStayAwake =
    (crisisStage != null && crisisStage <= 2) || globalStatus === "critical";
  const nightActive = inNightWindow && !isAwake && !mustStayAwake;

  return (
    <div
      className="monitor-tv-shell"
      data-pixel-shift={pixelShift}
      data-night={nightActive ? "1" : "0"}
    >
      {children}
      {nightActive && (
        <p className="monitor-night-hint" aria-hidden>
          Night mode · move pointer to wake
        </p>
      )}
    </div>
  );
}
