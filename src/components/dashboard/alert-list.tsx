"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { dismissAlert } from "@/app/actions/alerts";
import { MODULE_LABELS } from "@/lib/module-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type AlertRow = {
  id: string;
  level: string;
  module: string;
  message: string;
  createdAt: string;
  recommendation?: string | null;
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
      <p className="text-zinc-500 text-sm py-2">Keine offenen Warnungen.</p>
    );
  }

  return (
    <ul className={compact ? "space-y-2" : "space-y-3"}>
      {items.map((a) => (
        <li
          key={a.id}
          className={
            compact
              ? "flex flex-wrap items-center gap-2 text-sm"
              : "sg-alert-row flex flex-wrap items-start gap-3 rounded-lg border p-4"
          }
        >
          <Badge
            variant={
              a.level === "critical"
                ? "critical"
                : a.level === "warning"
                  ? "warning"
                  : "default"
            }
          >
            {a.level}
          </Badge>
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
