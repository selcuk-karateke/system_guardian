"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { dismissAlert } from "@/app/actions/alerts";
import { CopyReportButton } from "@/components/dashboard/copy-report-button";
import { CrisisStageBadge } from "@/components/dashboard/crisis-stage-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { MODULE_LABELS } from "@/lib/module-labels";
import { resolveCrisisStage, type CrisisStage } from "@/lib/crisis/stages";

export type AlertRow = {
  id: string;
  level: string;
  module: string;
  message: string;
  createdAt: string;
  recommendation?: string | null;
  reportText?: string;
  crisisStage?: CrisisStage;
};

export function AlertList({
  items,
  compact = false,
}: {
  items: AlertRow[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <EmptyState
        compact={compact}
        icon={ShieldCheck}
        title="Alles ruhig"
        description="Keine offenen Warnungen in S1–S4. Neue Funde erscheinen nach dem nächsten Check."
        action={{ href: "/monitor", label: "Monitor öffnen" }}
      />
    );
  }

  return (
    <ul className={compact ? "sg-stagger space-y-2" : "sg-stagger space-y-3"}>
      {items.map((a) => (
        <li
          key={a.id}
          className={
            compact
              ? "flex flex-wrap items-center gap-2 text-sm"
              : "sg-alert-row flex flex-wrap items-start gap-3 rounded-lg border p-4"
          }
        >
          <CrisisStageBadge
            stage={
              a.crisisStage ??
              resolveCrisisStage({
                module: a.module,
                level: a.level,
                message: a.message,
              })
            }
          />
          <span className="text-zinc-500 shrink-0">
            {MODULE_LABELS[a.module] ?? a.module}
          </span>
          <Link
            href={`/alerts/${a.id}`}
            className={
              compact
                ? "flex-1 min-w-0 sg-link hover:underline"
                : "flex-1 min-w-0 text-zinc-200 hover:text-sky-300 hover:underline"
            }
          >
            {a.message}
          </Link>
          {!compact && a.recommendation && (
            <p className="w-full text-xs text-zinc-500 pl-0 sm:pl-[calc(theme(spacing.2)+4.5rem)]">
              {a.recommendation}
            </p>
          )}
          {!compact && (
            <span className="text-xs text-zinc-500 w-full sm:w-auto">
              {new Date(a.createdAt).toLocaleString("de-DE")}
            </span>
          )}
          {compact && (
            <Link
              href={`/alerts/${a.id}`}
              className="text-xs text-zinc-500 hover:text-sky-400 shrink-0"
            >
              Details
            </Link>
          )}
          {a.reportText && (
            <CopyReportButton
              text={a.reportText}
              label="Kopieren"
              copiedLabel="OK"
              size="sm"
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 text-xs"
            disabled={pending}
            title="Warnung als unkritisch markieren und aus der Liste entfernen"
            onClick={() => {
              startTransition(async () => {
                await dismissAlert(a.id);
                router.refresh();
              });
            }}
          >
            Entschärfen
          </Button>
        </li>
      ))}
    </ul>
  );
}
