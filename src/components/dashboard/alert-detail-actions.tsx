"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { dismissAlert } from "@/app/actions/alerts";
import { triggerBackupAction } from "@/app/actions/protect";
import { CopyReportButton } from "@/components/dashboard/copy-report-button";
import { Button } from "@/components/ui/button";
import { runEnqueuedJob } from "@/lib/jobs/wake-client";
import { notifyProgress, notifyResult } from "@/lib/ui/notify";

export function AlertDetailActions({
  alertId,
  resolved,
  reportText,
  showBackupTrigger = false,
  serverId,
}: {
  alertId: string;
  resolved: boolean;
  reportText: string;
  showBackupTrigger?: boolean;
  serverId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-3">
      <CopyReportButton text={reportText} label="Bericht kopieren" />
      <Button asChild variant="outline" size="sm">
        <Link href="/notifications">← Alle Warnungen</Link>
      </Button>
      {showBackupTrigger && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await runEnqueuedJob(
                { label: "Backup" },
                () => triggerBackupAction(serverId),
              );
            });
          }}
        >
          {pending ? "Backup…" : "Backup anstoßen"}
        </Button>
      )}
      {!resolved && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            const id = `dismiss:${alertId}`;
            notifyProgress(id, "Warnung wird entschärft…");
            startTransition(async () => {
              try {
                await dismissAlert(alertId);
                notifyResult(
                  { ok: true, message: "Warnung entschärft" },
                  { id },
                );
                router.refresh();
              } catch (e) {
                notifyResult(
                  {
                    ok: false,
                    message:
                      e instanceof Error
                        ? e.message
                        : "Entschärfen fehlgeschlagen",
                  },
                  { id },
                );
              }
            });
          }}
        >
          Entschärfen
        </Button>
      )}
    </div>
  );
}
