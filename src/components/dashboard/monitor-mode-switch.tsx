"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe2, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

const MODES = [
  {
    href: "/monitor",
    label: "Screensaver",
    icon: Monitor,
    match: (p: string) => p === "/monitor" || p === "/monitor/",
  },
  {
    href: "/monitor/globe",
    label: "Globus",
    icon: Globe2,
    match: (p: string) => p.startsWith("/monitor/globe"),
  },
] as const;

type Props = {
  className?: string;
  /** denser icon-only control for monitor chrome */
  compact?: boolean;
};

export function MonitorModeSwitch({ className, compact = false }: Props) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "monitor-mode-switch inline-flex items-center gap-1",
        className,
      )}
      role="group"
      aria-label="Monitor-Ansicht"
    >
      {MODES.map((mode) => {
        const active = mode.match(pathname);
        const Icon = mode.icon;
        return (
          <Link
            key={mode.href}
            href={mode.href}
            title={mode.label}
            aria-label={mode.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "monitor-mode-btn",
              compact ? "monitor-mode-btn--compact" : "monitor-mode-btn--full",
              active && "monitor-mode-btn--active",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {!compact && <span>{mode.label}</span>}
          </Link>
        );
      })}
    </div>
  );
}
