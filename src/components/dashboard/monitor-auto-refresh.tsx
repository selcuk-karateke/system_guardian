"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function MonitorAutoRefresh({
  children,
  intervalSec = 30,
}: {
  children: React.ReactNode;
  intervalSec?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalSec * 1000);
    return () => clearInterval(id);
  }, [router, intervalSec]);

  return <>{children}</>;
}
