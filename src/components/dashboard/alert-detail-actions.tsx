"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dismissAlert } from "@/app/actions/alerts";
import { triggerBackupAction } from "@/app/actions/protect";
import { CopyReportButton } from "@/components/dashboard/copy-report-button";
import { Button } from "@/components/ui/button";

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
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  return (
    <div className="space-y-2">
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
              setBackupMsg(null);
              startTransition(async () => {
                const result = await triggerBackupAction(serverId);
                setBackupMsg(result.message);
                router.refresh();
              });
            }}
          >
            Backup anstoßen
          </Button>
        )}
        {!resolved && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await dismissAlert(alertId);
                router.refresh();
              });
            }}
          >
            Entschärfen
          </Button>
        )}
      </div>
      {backupMsg && (
        <p className="text-xs text-zinc-400">{backupMsg}</p>
      )}
    </div>
  );
}
