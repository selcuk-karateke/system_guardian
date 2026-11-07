"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildMonitorMetricCardsFromLive,
  type MetricToneThresholds,
  type MonitorLiveHostVitals,
  type MonitorMetricCards,
} from "@/lib/monitor-metric-cards";
import type { CrisisStage } from "@/lib/crisis/stages";
import {
  moveMetricOrder,
  type MetricOrderKey,
} from "@/lib/monitor/metric-order";
import { formatUptime } from "@/lib/utils";
import { saveUiLayoutAction } from "@/app/actions/ui-layout";
import type { UiLayout } from "@/lib/ui-layout";
import { patchLocalMonitor, readLocalUiLayout } from "@/lib/ui-layout-local";
import { MonitorHeroMetric } from "./monitor-metric";
import {
  MonitorStatusBand,
  type MonitorEgressInfo,
} from "./monitor-status-band";
import {
  useMonitorEgressPollMs,
  useMonitorLiveEgress,
} from "./monitor-auto-refresh";

type LiveSeed = {
  egress: MonitorEgressInfo | null;
  host: MonitorLiveHostVitals | null;
};

type LivePollResponse = {
  ok?: boolean;
  online?: boolean;
  egress?: MonitorEgressInfo | null;
  host?: MonitorLiveHostVitals | null;
};

type Props = {
  wallTone: "healthy" | "warning" | "critical";
  crisisStage: CrisisStage | null;
  hero: string;
  counts: { ok: number; s4: number; s3: number; s2: number; s1: number };
  lastCheck: Date | null;
  serverId?: string | null;
  initial: LiveSeed;
  metricCards: MonitorMetricCards;
  cpuCores?: number | null;
  toneThresholds?: MetricToneThresholds;
  /** Controlled metric card order (from ui layout). */
  metricOrder?: MetricOrderKey[];
  onMetricOrderChange?: (order: MetricOrderKey[]) => void;
  canPersistMetrics?: boolean;
  fullLayout?: UiLayout;
  /** Disable drag while module layout editor is open */
  layoutEditing?: boolean;
};

function egressKey(e: MonitorEgressInfo | null | undefined): string {
  if (!e) return "";
  return [
    e.txMbps?.toFixed(2) ?? "",
    e.txBytes ?? "",
    e.windowSec ?? "",
    e.iface ?? "",
    e.topTalker ?? "",
  ].join("|");
}

function hostKey(h: MonitorLiveHostVitals | null | undefined): string {
  if (!h) return "";
  return [
    h.load1 ?? "",
    h.load5 ?? "",
    h.load15 ?? "",
    h.cpuPercent ?? "",
    h.ramPercent ?? "",
    h.diskPercent ?? "",
    h.uptimeSec ?? "",
  ].join("|");
}

const SPARK_HISTORY = 48;

type MetricSeries = {
  load: number[];
  ram: number[];
  disk: number[];
  uptime: number[];
};

function pushSample(prev: number[], next: number | null | undefined): number[] {
  if (next == null || !Number.isFinite(next)) return prev;
  const out = prev.length ? [...prev, next] : [next, next];
  return out.length > SPARK_HISTORY ? out.slice(-SPARK_HISTORY) : out;
}

function useMonitorLivePoll(
  serverId: string | null | undefined,
  initial: LiveSeed,
): {
  egress: MonitorEgressInfo | null;
  host: MonitorLiveHostVitals | null;
  streamLive: boolean;
  sampleGen: number;
} {
  const [egress, setEgress] = useState<MonitorEgressInfo | null>(
    initial.egress,
  );
  const [host, setHost] = useState<MonitorLiveHostVitals | null>(initial.host);
  const [streamLive, setStreamLive] = useState(false);
  const [sampleGen, setSampleGen] = useState(0);
  const egressKeyRef = useRef(egressKey(initial.egress));
  const hostKeyRef = useRef(hostKey(initial.host));

  const seedEgressKey = egressKey(initial.egress);
  const seedHostKey = hostKey(initial.host);
  useEffect(() => {
    setEgress(initial.egress);
    egressKeyRef.current = seedEgressKey;
  }, [initial.egress, seedEgressKey]);
  useEffect(() => {
    setHost(initial.host);
    hostKeyRef.current = seedHostKey;
  }, [initial.host, seedHostKey]);

  const liveEnabled = useMonitorLiveEgress();
  const egressMs = useMonitorEgressPollMs();

  useEffect(() => {
    if (!liveEnabled || !serverId || egressMs <= 0) {
      setStreamLive(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/monitor/live?serverId=${encodeURIComponent(serverId)}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) {
          if (!cancelled) setStreamLive(false);
          return;
        }
        const data = (await res.json()) as LivePollResponse;
        if (!data.ok || cancelled) return;

        const nextEgress = data.egress ?? null;
        const nextHost = data.host ?? null;
        const agentFresh =
          data.online === true || nextEgress != null || nextHost != null;
        setStreamLive((was) => (was === agentFresh ? was : agentFresh));

        const nextEgressKey = egressKey(nextEgress);
        if (nextEgressKey !== egressKeyRef.current) {
          if (!nextEgress && egressKeyRef.current) {
            /* keep last good egress while agent hiccups */
          } else {
            egressKeyRef.current = nextEgressKey;
            setEgress(nextEgress);
          }
        }

        const nextHostKey = hostKey(nextHost);
        if (nextHostKey !== hostKeyRef.current) {
          if (!nextHost && hostKeyRef.current) {
            /* keep last good host vitals */
          } else {
            hostKeyRef.current = nextHostKey;
            setHost(nextHost);
          }
        }
        // Extend sparklines even when vitals are flat
        if (agentFresh) setSampleGen((n) => n + 1);
      } catch {
        if (!cancelled) setStreamLive((was) => (was ? false : was));
      } finally {
        if (!cancelled) timer = setTimeout(tick, egressMs);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setStreamLive(false);
    };
  }, [serverId, liveEnabled, egressMs]);

  return { egress, host, streamLive, sampleGen };
}

/**
 * Owns the single /api/monitor/live poll for status-band egress + Load/RAM/Disk.
 */
export function MonitorLivePanel({
  wallTone,
  crisisStage,
  hero,
  counts,
  lastCheck,
  serverId = null,
  initial,
  metricCards,
  cpuCores = null,
  toneThresholds,
  metricOrder,
  onMetricOrderChange,
  canPersistMetrics = false,
  fullLayout,
  layoutEditing = false,
}: Props) {
  const { egress, host, streamLive, sampleGen } = useMonitorLivePoll(
    serverId,
    initial,
  );

  const liveCards = useMemo(() => {
    if (!host) return metricCards;
    const uptimeFormatted =
      host.uptimeSec != null
        ? formatUptime(host.uptimeSec)
        : metricCards.uptime.display;
    return buildMonitorMetricCardsFromLive(host, {
      cpuCores,
      uptimeFormatted,
      uptimeLines: metricCards.uptime.lines,
      seed: metricCards,
      thresholds: toneThresholds,
    });
  }, [host, metricCards, cpuCores, toneThresholds]);

  const seedSeries = (): MetricSeries => {
    const load =
      liveCards.cpu.displayValue != null
        ? Number.parseFloat(liveCards.cpu.displayValue)
        : liveCards.cpu.value;
    return {
      load: pushSample([], Number.isFinite(load) ? load : null),
      ram: pushSample([], liveCards.ram.value),
      disk: pushSample([], liveCards.disk.value),
      uptime: pushSample([], initial.host?.uptimeSec ?? null),
    };
  };

  const [series, setSeries] = useState<MetricSeries>(seedSeries);
  const [order, setOrder] = useState<MetricOrderKey[]>(
    metricOrder ?? ["load", "ram", "disk", "uptime"],
  );
  const [dragId, setDragId] = useState<MetricOrderKey | null>(null);
  const [overId, setOverId] = useState<MetricOrderKey | null>(null);
  const dragIdRef = useRef<MetricOrderKey | null>(null);

  useEffect(() => {
    if (metricOrder) setOrder(metricOrder);
  }, [metricOrder]);

  const prevServerRef = useRef(serverId);
  useEffect(() => {
    if (prevServerRef.current === serverId) return;
    prevServerRef.current = serverId;
    setSeries(seedSeries());
  }, [serverId, liveCards, initial.host?.uptimeSec]);

  const liveCardsRef = useRef(liveCards);
  liveCardsRef.current = liveCards;
  const hostRef = useRef(host);
  hostRef.current = host;

  useEffect(() => {
    // Only extend on live poll ticks — not on every cards identity change
    if (sampleGen <= 0) return;
    const cards = liveCardsRef.current;
    const h = hostRef.current;
    const loadRaw =
      cards.cpu.displayValue != null
        ? Number.parseFloat(cards.cpu.displayValue)
        : cards.cpu.value;
    const load = Number.isFinite(loadRaw as number)
      ? (loadRaw as number)
      : null;
    setSeries((prev) => ({
      load: pushSample(prev.load, load),
      ram: pushSample(prev.ram, cards.ram.value),
      disk: pushSample(prev.disk, cards.disk.value),
      uptime: pushSample(
        prev.uptime,
        h?.uptimeSec ?? initial.host?.uptimeSec ?? null,
      ),
    }));
  }, [sampleGen, initial.host?.uptimeSec]);

  const clearDrag = () => {
    dragIdRef.current = null;
    setDragId(null);
    setOverId(null);
  };

  const persistOrder = (next: MetricOrderKey[]) => {
    setOrder(next);
    onMetricOrderChange?.(next);
    const baseModules =
      fullLayout?.monitor.modules ?? readLocalUiLayout().monitor.modules;
    const monitor = { metrics: next, modules: baseModules };
    if (canPersistMetrics) {
      void saveUiLayoutAction({ monitor });
    } else {
      patchLocalMonitor(monitor);
    }
  };

  const dragProps = (id: MetricOrderKey) =>
    layoutEditing
      ? {}
      : {
          dragId: id,
          dragging: dragId === id,
          dropTarget: overId === id && dragId !== id,
          onDragStartCard: (startId: string) => {
            const key = startId as MetricOrderKey;
            dragIdRef.current = key;
            setDragId(key);
          },
          onDragOverCard: (over: string) => setOverId(over as MetricOrderKey),
          onDropCard: (target: string) => {
            const from = dragIdRef.current;
            if (!from) return;
            persistOrder(
              moveMetricOrder(order, from, target as MetricOrderKey),
            );
            clearDrag();
          },
          onDragEndCard: clearDrag,
        };

  const cards: Record<MetricOrderKey, ReactNode> = {
    load: (
      <MonitorHeroMetric
        key="load"
        label="Load"
        value={liveCards.cpu.value}
        displayValue={liveCards.cpu.displayValue ?? undefined}
        lines={liveCards.cpu.lines}
        tone={liveCards.cpu.tone}
        series={series.load}
        {...dragProps("load")}
      />
    ),
    ram: (
      <MonitorHeroMetric
        key="ram"
        label="RAM"
        value={liveCards.ram.value}
        lines={liveCards.ram.lines}
        tone={liveCards.ram.tone}
        series={series.ram}
        seriesDomain={{ min: 0, max: 100 }}
        {...dragProps("ram")}
      />
    ),
    disk: (
      <MonitorHeroMetric
        key="disk"
        label="Disk"
        value={liveCards.disk.value}
        lines={liveCards.disk.lines}
        tone={liveCards.disk.tone}
        series={series.disk}
        seriesDomain={{ min: 0, max: 100 }}
        {...dragProps("disk")}
      />
    ),
    uptime: (
      <MonitorHeroMetric
        key="uptime"
        label="Uptime"
        value={null}
        displayValue={liveCards.uptime.display}
        lines={liveCards.uptime.lines}
        series={series.uptime}
        {...dragProps("uptime")}
      />
    ),
  };

  return (
    <div className="monitor-live-stack">
      <MonitorStatusBand
        wallTone={wallTone}
        crisisStage={crisisStage}
        hero={hero}
        counts={counts}
        lastCheck={lastCheck}
        egress={egress}
        streamLive={streamLive}
      />

      <section
        className="monitor-metrics"
        aria-label="Host-Metriken — ziehen zum Umordnen"
      >
        {order.map((key) => cards[key])}
      </section>
    </div>
  );
}
