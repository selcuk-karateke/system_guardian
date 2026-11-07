"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MonitorTile } from "./monitor-tile";
import type { CrisisStage } from "@/lib/crisis/stages";

type TileSeverity = CrisisStage | "ok" | "unknown";

export type MonitorModuleSection = {
  id: string;
  /** Short stage label, e.g. "1 · CORE" */
  label: string;
  modules: readonly string[];
};

type Props = {
  sections: readonly MonitorModuleSection[];
  severityMap: Record<string, TileSeverity>;
  moduleDetails: Record<string, string[]>;
  /** How many tile-rows should roughly fill the viewport (speed + loop threshold) */
  visibleRows?: number;
  /** Seconds for one tile-row to scroll past */
  secondsPerRow?: number;
  /** Pause auto-scroll while layout editor is open */
  layoutEditing?: boolean;
};

export function MonitorModuleGrid({
  sections,
  severityMap,
  moduleDetails,
  visibleRows = 4,
  secondsPerRow = 3.5,
  layoutEditing = false,
}: Props) {
  const totalModules = sections.reduce((n, s) => n + s.modules.length, 0);
  const approxRows = Math.max(1, Math.ceil(totalModules / 4));
  const shouldLoop = approxRows > visibleRows;

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const copyHRef = useRef(0);
  const periodRef = useRef(0);
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);
  const reducedRef = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);

  const setPausedState = useCallback((next: boolean) => {
    pausedRef.current = next;
    setPaused(next);
  }, []);

  /** Wheel scrub pause — always clears. Hover freeze is :hover in the rAF
   *  loop only (no sticky pointerenter that survives layout shifts). */
  const pauseBriefly = useCallback(
    (ms = 2200) => {
      setPausedState(true);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => {
        setPausedState(false);
      }, ms);
    },
    [setPausedState],
  );

  // Measure natural copy height (sections + stage dividers).
  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const applySize = () => {
      const copy = track.querySelector<HTMLElement>(".monitor-grid-copy");
      if (!copy) return;
      const copyH = copy.offsetHeight;
      if (copyH <= 0) return;
      const loopDiv = track.querySelector<HTMLElement>(
        ".monitor-grid-loop-divider",
      );
      const dividerH = shouldLoop && loopDiv ? loopDiv.offsetHeight : 0;
      const period = copyH + dividerH;
      if (
        Math.abs(copyH - copyHRef.current) < 0.5 &&
        Math.abs(period - periodRef.current) < 0.5
      ) {
        return;
      }
      copyHRef.current = copyH;
      periodRef.current = period;
    };

    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(viewport);
    ro.observe(track);
    return () => ro.disconnect();
  }, [shouldLoop, sections]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !shouldLoop) {
      offsetRef.current = 0;
      if (track) track.style.transform = "translate3d(0,0,0)";
      return;
    }

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onMq = () => {
      reducedRef.current = mq.matches;
    };
    mq.addEventListener("change", onMq);

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;

      const copyH = copyHRef.current;
      const period = periodRef.current || copyH;
      if (copyH <= 0 || period <= 0) {
        raf = requestAnimationFrame(tick);
        return;
      }

      // One "row" ≈ copy height / approx rows
      const rowH = copyH / approxRows;
      const speed = rowH / (secondsPerRow * 1000);

      const hovering = Boolean(viewportRef.current?.matches(":hover"));
      if (
        !layoutEditing &&
        !reducedRef.current &&
        !pausedRef.current &&
        !hovering &&
        document.visibilityState === "visible"
      ) {
        offsetRef.current += speed * dt;
      }

      while (offsetRef.current >= period) offsetRef.current -= period;
      while (offsetRef.current < 0) offsetRef.current += period;

      track.style.transform = `translate3d(0, ${-offsetRef.current}px, 0)`;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", onMq);
    };
  }, [shouldLoop, approxRows, secondsPerRow, layoutEditing]);

  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !shouldLoop) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Hover already freezes via :hover; wheel scrub always works.
      pauseBriefly();
      offsetRef.current += e.deltaY;
      const period = periodRef.current || copyHRef.current;
      if (period > 0) {
        while (offsetRef.current >= period) offsetRef.current -= period;
        while (offsetRef.current < 0) offsetRef.current += period;
      }
      const track = trackRef.current;
      if (track) {
        track.style.transform = `translate3d(0, ${-offsetRef.current}px, 0)`;
      }
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [shouldLoop, pauseBriefly]);

  const renderCopy = (copy: number) => (
    <div
      key={`copy-${copy}`}
      className="monitor-grid-copy"
      aria-hidden={copy > 0 ? true : undefined}
    >
      {sections.map((section, sectionIndex) => (
        <section
          key={`${copy}-${section.id}`}
          className="monitor-grid-section"
        >
          {sectionIndex > 0 && (
            <div className="monitor-grid-stage-divider" aria-hidden="true">
              <span className="monitor-grid-stage-divider-label">
                {section.label}
              </span>
            </div>
          )}
          {sectionIndex === 0 && (
            <div className="monitor-grid-stage-head">
              <span className="monitor-grid-stage-divider-label">
                {section.label}
              </span>
            </div>
          )}
          <div className="monitor-grid monitor-grid--flat">
            {section.modules.map((mod) => (
              <MonitorTile
                key={`${copy}-${section.id}-${mod}`}
                module={mod}
                severity={severityMap[mod] ?? "unknown"}
                details={moduleDetails[mod]}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <div
      className="monitor-grid-shell"
      data-paused={paused || layoutEditing ? "1" : "0"}
      data-loop={shouldLoop ? "1" : "0"}
    >
      <div ref={viewportRef} className="monitor-grid-viewport">
        <div ref={trackRef} className="monitor-grid-track">
          {renderCopy(0)}
          {shouldLoop && (
            <div className="monitor-grid-loop-divider" aria-hidden="true">
              <span className="monitor-grid-loop-divider-line" />
              <span className="monitor-grid-loop-divider-label">LOOP</span>
              <span className="monitor-grid-loop-divider-line" />
            </div>
          )}
          {shouldLoop && renderCopy(1)}
        </div>
      </div>
    </div>
  );
}
