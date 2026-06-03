"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { dismissAlert } from "@/app/actions/alerts";
import { Button } from "@/components/ui/button";

export function AlertDetailActions({
  alertId,
  resolved,
}: {
  alertId: string;
  resolved: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-3">
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
