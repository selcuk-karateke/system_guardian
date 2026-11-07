import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Action = {
  href: string;
  label: string;
};

type Props = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: Action;
  /** Compact for nested cards / lists */
  compact?: boolean;
  className?: string;
};

/**
 * Guided empty / no-results surface — Phase 1 UX checklist.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: Props) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-start",
        compact ? "gap-1.5 py-3" : "gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-5 py-8",
        className,
      )}
    >
      <div
        className={cn(
          "inline-flex items-center justify-center rounded-lg border border-sky-800/40 bg-sky-500/5 text-sky-400/90",
          compact ? "size-8" : "size-11",
        )}
        aria-hidden
      >
        <Icon className={compact ? "size-4" : "size-5"} />
      </div>
      <div className="space-y-1 min-w-0">
        <p
          className={cn(
            "font-medium text-zinc-200",
            compact ? "text-sm" : "text-base",
          )}
        >
          {title}
        </p>
        {description ? (
          <p
            className={cn(
              "text-zinc-500 max-w-md",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className={cn(
            "sg-link font-medium text-sky-400 hover:underline",
            compact ? "text-xs mt-0.5" : "text-sm mt-1",
          )}
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
