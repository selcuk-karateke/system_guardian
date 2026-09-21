"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { dismissAlert } from "@/app/actions/alerts";
import { CopyReportButton } from "@/components/dashboard/copy-report-button";
import { Button } from "@/components/ui/button";

export function AlertDetailActions({
  alertId,
  resolved,
  reportText,
}: {
  alertId: string;
  resolved: boolean;
  reportText: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-3">
      <CopyReportButton text={reportText} label="Bericht kopieren" />
      <Button asChild variant="outline" size="sm">
        <Link href="/notifications">← Alle Warnungen</Link>
      </Button>
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
  );
}
