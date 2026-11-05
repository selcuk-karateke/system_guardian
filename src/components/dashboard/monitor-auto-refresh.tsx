"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef } from "react";

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
    const ms = Math.max(15, intervalSec) * 1000;
    const id = setInterval(() => {
      // Non-urgent refresh — avoids hard UI flash every cycle (esp. 4K TV).
      startTransition(() => {
        routerRef.current.refresh();
      });
    }, ms);
    return () => clearInterval(id);
  }, [intervalSec]);

  return <>{children}</>;
}
