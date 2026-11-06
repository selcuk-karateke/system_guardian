"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  Boxes,
  Database,
  Globe2,
  HardDrive,
  History,
  LayoutDashboard,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { SgScrollRail } from "@/components/ui/sg-scroll-rail";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Überblick",
    items: [
      { href: "/", label: "Dashboard", short: "Dash", icon: LayoutDashboard },
      {
        href: "/monitor",
        label: "Screensaver",
        short: "TV",
        icon: Monitor,
      },
      {
        href: "/monitor/globe",
        label: "Globus",
        short: "Geo",
        icon: Globe2,
      },
    ],
  },
  {
    id: "infra",
    label: "Infrastruktur",
    items: [
      {
        href: "/infrastructure",
        label: "Infrastruktur",
        short: "Infra",
        icon: HardDrive,
      },
      { href: "/docker", label: "Docker", short: "Dock", icon: Boxes },
      { href: "/databases", label: "Datenbanken", short: "DB", icon: Database },
    ],
  },
  {
    id: "security",
    label: "Sicherheit",
    items: [
      { href: "/security", label: "Sicherheit", short: "Sec", icon: Shield },
      { href: "/history", label: "Historie", short: "Hist", icon: History },
      {
        href: "/notifications",
        label: "Benachrichtigungen",
        short: "Alert",
        icon: Bell,
      },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: "/docs", label: "Dokumentation", short: "Docs", icon: BookOpen },
      { href: "/settings", label: "Einstellungen", short: "Set", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/monitor") {
    return pathname === "/monitor" || pathname === "/monitor/";
  }
  if (href === "/monitor/globe") {
    return pathname.startsWith("/monitor/globe");
  }
  if (href === "/notifications") {
    return pathname === "/notifications" || pathname.startsWith("/alerts/");
  }
  if (href === "/docs") {
    return pathname === "/docs" || pathname.startsWith("/docs/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function activeGroupId(pathname: string): string {
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => isActive(pathname, item.href))) {
      return group.id;
    }
  }
  return "overview";
}

type Props = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
  showCollapseToggle?: boolean;
};

export function SidebarNav({
  collapsed,
  onToggleCollapse,
  onNavigate,
  showCollapseToggle = true,
}: Props) {
  const pathname = usePathname();
  const contextGroup = activeGroupId(pathname);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [pathname]);

  return (
    <nav className="sg-sidebar-nav flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "sg-sidebar-header shrink-0 border-b border-zinc-800/80",
          collapsed ? "flex flex-col items-center gap-2 p-2" : "flex items-start gap-2 p-3",
        )}
      >
        <div
          className={cn(
            "sg-nav-brand min-w-0",
            collapsed ? "text-center" : "flex-1 px-1",
          )}
        >
          {collapsed ? (
            <strong className="!mt-0" title="System Guardian">
              SG
            </strong>
          ) : (
            <>
              <span>Ops Console</span>
              <strong>System Guardian</strong>
            </>
          )}
        </div>
        {showCollapseToggle && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="sg-nav-toggle shrink-0"
            aria-label={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
            title={collapsed ? "Ausklappen" : "Einklappen"}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden />
            )}
          </button>
        )}
      </div>

      {!collapsed && (
        <p className="sg-nav-context shrink-0 px-4 pt-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-sky-400/90">
          {NAV_GROUPS.find((g) => g.id === contextGroup)?.label}
        </p>
      )}

      <SgScrollRail className="sg-sidebar-scroll min-h-0 flex-1 px-2 pb-1 pt-1">
        {NAV_GROUPS.map((group) => {
          const groupActive = group.id === contextGroup;
          return (
            <div
              key={group.id}
              className={cn(
                "mb-2 last:mb-0",
                !collapsed && !groupActive && "opacity-70",
              )}
            >
              {!collapsed && (
                <p
                  className={cn(
                    "px-2 pb-1 pt-2 text-[0.6rem] font-semibold uppercase tracking-wider",
                    groupActive ? "text-zinc-300" : "text-zinc-600",
                  )}
                >
                  {group.label}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      onClick={onNavigate}
                      ref={active ? activeRef : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "sg-nav-link rounded-lg text-sm",
                        collapsed
                          ? "flex flex-col items-center gap-0.5 px-1.5 py-2"
                          : "flex items-center gap-2.5 px-3 py-2",
                        active
                          ? "sg-nav-link--active"
                          : "text-zinc-400 hover:text-white",
                      )}
                    >
                      <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
                      {collapsed ? (
                        <span className="text-[0.65rem] leading-none tracking-tight">
                          {item.short}
                        </span>
                      ) : (
                        <span className="truncate">{item.label}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </SgScrollRail>
    </nav>
  );
}
