"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissAllOpenAlerts } from "@/app/actions/alerts";
import { Button } from "@/components/ui/button";

export function DismissAlertsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            const r = await dismissAllOpenAlerts();
            setMsg(`${r.count} Warnung(en) geschlossen`);
            router.refresh();
          });
        }}
      >
        {pending ? "…" : "Alle offenen Warnungen schließen"}
      </Button>
      {msg && <span className="text-sm text-zinc-500">{msg}</span>}
    </div>
  );
}
