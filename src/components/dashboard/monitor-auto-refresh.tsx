"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef } from "react";

/** Survives remounts — hard stop against refresh storms. */
let lastMonitorRefreshAt = 0;

export function MonitorAutoRefresh({
  children,
  intervalSec = 60,
}: {
  children: React.ReactNode;
  intervalSec?: number;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const sec = Number.isFinite(intervalSec) ? intervalSec : 60;
    const ms = Math.max(15_000, Math.round(sec * 1000));

    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastMonitorRefreshAt < ms - 500) return;
      lastMonitorRefreshAt = now;
      startTransition(() => {
        routerRef.current.refresh();
      });
    }, ms);

    return () => clearInterval(id);
  }, [intervalSec]);

  return <>{children}</>;
}
