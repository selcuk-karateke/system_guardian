"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function MonitorReloadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      className="monitor-reload-btn monitor-reload-btn--icon"
      onClick={reload}
      disabled={pending}
      aria-label="Monitor neu laden"
      title="Daten neu laden"
    >
      <RefreshCw
        className={`size-3.5${pending ? " monitor-reload-icon--spin" : ""}`}
        aria-hidden
      />
    </button>
  );
}
