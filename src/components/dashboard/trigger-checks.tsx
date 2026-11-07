"use client";

import { Loader2, Play, Server, Shield } from "lucide-react";
import { useTransition } from "react";
import {
  triggerAllChecks,
  triggerSecurityChecks,
  triggerServerChecks,
} from "@/app/actions/trigger-checks";
import { Button } from "@/components/ui/button";
import { wakeBackgroundJobsOverlay } from "@/lib/jobs/wake-client";
import { notifyResult } from "@/lib/ui/notify";
import { cn } from "@/lib/utils";

type Props = {
  variant?: "default" | "compact" | "monitor";
};

export function TriggerChecks({ variant = "default" }: Props) {
  const [pending, startTransition] = useTransition();

  function run(
    label: string,
    fn: () => Promise<{ ok: boolean; message: string }>,
  ) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        wakeBackgroundJobsOverlay({ label });
        return;
      }
      notifyResult(result);
    });
  }

  const compact = variant === "compact";
  const monitor = variant === "monitor";

  return (
    <div
      className={cn("flex flex-wrap gap-2", monitor && "justify-end")}
    >
      <Button
        type="button"
        variant="outline"
        className={cn(
          compact
            ? "size-8 p-0 border-zinc-700 bg-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            : monitor
              ? "h-auto gap-2 px-5 py-3 text-base"
              : "gap-2",
        )}
        disabled={pending}
        title="Server-Checks"
        aria-label="Server-Checks"
        onClick={() => run("Server-Checks", triggerServerChecks)}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Server className="size-4" aria-hidden />
        )}
        {!compact ? <span>Server</span> : null}
      </Button>
      <Button
        type="button"
        variant="outline"
        className={cn(
          compact
            ? "size-8 p-0 border-zinc-700 bg-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            : monitor
              ? "h-auto gap-2 px-5 py-3 text-base"
              : "gap-2",
        )}
        disabled={pending}
        title="Security-Checks"
        aria-label="Security-Checks"
        onClick={() => run("Security-Checks", triggerSecurityChecks)}
      >
        <Shield className="size-4" aria-hidden />
        {!compact ? <span>Security</span> : null}
      </Button>
      <Button
        type="button"
        variant={compact ? "outline" : "default"}
        className={cn(
          compact
            ? "size-8 p-0 border-sky-800/60 bg-transparent text-sky-400/90 hover:bg-sky-500/10"
            : monitor
              ? "h-auto gap-2 px-5 py-3 text-base"
              : "gap-2",
        )}
        disabled={pending}
        title="Alle Checks jetzt"
        aria-label="Alle Checks jetzt"
        onClick={() => run("Alle Checks", triggerAllChecks)}
      >
        <Play className="size-4" aria-hidden />
        {!compact ? <span>Alle Checks</span> : null}
      </Button>
    </div>
  );
}
