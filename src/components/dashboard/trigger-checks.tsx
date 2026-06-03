"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  triggerAllChecks,
  triggerSecurityChecks,
  triggerServerChecks,
} from "@/app/actions/trigger-checks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  variant?: "default" | "compact" | "monitor";
};

export function TriggerChecks({ variant = "default" }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  const btnClass =
    variant === "monitor"
      ? "text-base px-5 py-3 h-auto"
      : variant === "compact"
        ? "text-xs h-8 border-zinc-700 bg-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
        : "";

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        variant === "monitor" && "items-end",
      )}
    >
      <div className={cn("flex flex-wrap gap-2", variant === "monitor" && "justify-end")}>
        <Button
          type="button"
          variant="outline"
          className={btnClass}
          disabled={pending}
          onClick={() => run(triggerServerChecks)}
        >
          {pending ? "Läuft…" : "Server-Checks"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={btnClass}
          disabled={pending}
          onClick={() => run(triggerSecurityChecks)}
        >
          Security-Checks
        </Button>
        <Button
          type="button"
          variant={variant === "compact" ? "outline" : "default"}
          className={cn(btnClass, variant === "compact" && "border-sky-800/60 text-sky-400/90 hover:bg-sky-500/10")}
          disabled={pending}
          onClick={() => run(triggerAllChecks)}
        >
          Alle Checks jetzt
        </Button>
      </div>
      {message && (
        <p
          className={cn(
            "text-zinc-400",
            variant === "monitor" ? "text-lg text-right" : "text-sm",
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}
