"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MODULE_LABELS } from "@/lib/module-labels";
import {
  compareCrisisAlerts,
  crisisStageToWallTone,
  resolveCrisisStage,
  CRISIS_STAGE_META,
} from "@/lib/crisis/stages";

export type MonitorTickerAlert = {
  id: string;
  level: string;
  module: string;
  message: string;
};

type Props = {
  alerts: MonitorTickerAlert[];
  intervalMs?: number;
};

export function MonitorAlertTicker({ alerts, intervalMs = 3000 }: Props) {
  const sorted = useMemo(
    () => [...alerts].sort(compareCrisisAlerts),
    [alerts],
  );

  const [index, setIndex] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [sorted.length, sorted[0]?.id]);

  useEffect(() => {
    if (sorted.length <= 1) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % sorted.length);
    }, intervalMs);
    return () => clearInterval(t);
  }, [sorted.length, intervalMs, tick]);

  const go = useCallback(
    (delta: number) => {
      if (sorted.length <= 1) return;
      setIndex((i) => (i + delta + sorted.length) % sorted.length);
      setTick((t) => t + 1);
    },
    [sorted.length],
  );

  if (!sorted.length) {
    return <span className="monitor-bottom-empty">No open alerts</span>;
  }

  const current = sorted[index]!;
  const stage = resolveCrisisStage(current);
  const meta = CRISIS_STAGE_META[stage];
  const tone = crisisStageToWallTone(stage);
  const footerClass =
    tone === "critical"
      ? "monitor-bottom--critical"
      : tone === "warning"
        ? "monitor-bottom--warning"
        : "";

  const showNav = sorted.length > 1;

  return (
    <div className={`monitor-bottom-row ${footerClass}`} data-count={sorted.length}>
      {showNav ? (
        <button
          type="button"
          className="monitor-bottom-nav"
          aria-label="Vorherige Meldung"
          onClick={() => go(-1)}
        >
          ‹
        </button>
      ) : null}

      <div className="monitor-bottom-inner">
        <Link href={`/alerts/${current.id}`} className="monitor-bottom-link">
          <span
            className={`monitor-bottom-label monitor-bottom-label--${
              tone === "critical" ? "critical" : "warning"
            }`}
          >
            {meta.short}
            {showNav ? (
              <span className="monitor-bottom-counter">
                {" "}
                {index + 1}/{sorted.length}
              </span>
            ) : null}
          </span>
          <span className="monitor-bottom-text">
            {MODULE_LABELS[current.module] ?? current.module} — {current.message}
          </span>
        </Link>
      </div>

      {showNav ? (
        <button
          type="button"
          className="monitor-bottom-nav"
          aria-label="Nächste Meldung"
          onClick={() => go(1)}
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
