"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_MONITOR_REFRESH_MODE,
  getMonitorRefreshOption,
  MONITOR_REFRESH_OPTIONS,
  type MonitorRefreshMode,
  readMonitorRefreshMode,
  writeMonitorRefreshMode,
} from "@/lib/monitor/refresh-mode";

type RefreshGuard = { lastAt: number };
function refreshGuard(): RefreshGuard {
  const g = globalThis as typeof globalThis & {
    __sg_monitor_refresh__?: RefreshGuard;
  };
  if (!g.__sg_monitor_refresh__) g.__sg_monitor_refresh__ = { lastAt: 0 };
  return g.__sg_monitor_refresh__;
}

type RefreshCtx = {
  mode: MonitorRefreshMode;
  setMode: (m: MonitorRefreshMode) => void;
  live: boolean;
  egressMs: number;
  ready: boolean;
};

const MonitorRefreshCtx = createContext<RefreshCtx | null>(null);

export function useMonitorLiveEgress(): boolean {
  const ctx = useContext(MonitorRefreshCtx);
  if (!ctx) return true;
  return ctx.ready ? ctx.live : false;
}

export function useMonitorEgressPollMs(): number {
  const ctx = useContext(MonitorRefreshCtx);
  if (!ctx?.ready || !ctx.live) return 0;
  return ctx.egressMs;
}

export function useMonitorRefreshMode(): MonitorRefreshMode {
  return (
    useContext(MonitorRefreshCtx)?.mode ?? DEFAULT_MONITOR_REFRESH_MODE
  );
}

export function MonitorAutoRefresh({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  // Prefer in-memory / localStorage on first client paint — avoids 1 Min flash.
  const [mode, setModeState] = useState<MonitorRefreshMode>(() =>
    readMonitorRefreshMode(),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readMonitorRefreshMode();
    setModeState(stored);
    setReady(true);
  }, []);

  const option = getMonitorRefreshOption(mode);

  const setMode = useCallback((next: MonitorRefreshMode) => {
    writeMonitorRefreshMode(next);
    setModeState(next);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const sec = option.wallSec;
    if (!sec || sec <= 0) return;

    // Honor 30s option; floor only guards against accidental sub-second intervals
    const ms = Math.max(15_000, Math.round(sec * 1000));
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const guard = refreshGuard();
      const now = Date.now();
      if (now - guard.lastAt < ms - 500) return;
      guard.lastAt = now;
      startTransition(() => {
        routerRef.current.refresh();
      });
    }, ms);

    return () => clearInterval(id);
  }, [ready, option.wallSec]);

  const ctx = useMemo(
    () => ({
      mode,
      setMode,
      live: option.live,
      egressMs: option.egressMs,
      ready,
    }),
    [mode, setMode, option.live, option.egressMs, ready],
  );

  return (
    <MonitorRefreshCtx.Provider value={ctx}>
      {children}
    </MonitorRefreshCtx.Provider>
  );
}

/** Compact interval control in the status-band meta row. */
export function MonitorRefreshSelect({ className }: { className?: string }) {
  const ctx = useContext(MonitorRefreshCtx);
  if (!ctx) return null;

  if (!ctx.ready) {
    return (
      <span className={className} aria-hidden>
        …
      </span>
    );
  }

  return (
    <label className={className}>
      <span className="sr-only">Update-Intervall</span>
      <select
        value={ctx.mode}
        onChange={(e) =>
          ctx.setMode(e.target.value as MonitorRefreshMode)
        }
        title="Wand-Refresh und Live-Egress"
        aria-label="Update-Intervall"
      >
        {MONITOR_REFRESH_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
