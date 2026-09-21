"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/monitor", label: "Monitor (TV)" },
  { href: "/infrastructure", label: "Infrastruktur" },
  { href: "/docker", label: "Docker" },
  { href: "/databases", label: "Datenbanken" },
  { href: "/security", label: "Sicherheit" },
  { href: "/history", label: "Historie" },
  { href: "/notifications", label: "Benachrichtigungen" },
  { href: "/settings", label: "Einstellungen" },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-4 h-full">
      <div className="sg-nav-brand mb-4 px-2">
        <span>Ops Console</span>
        <strong>System Guardian</strong>
      </div>
      {NAV.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : item.href === "/notifications"
              ? pathname === "/notifications" ||
                pathname.startsWith("/alerts/")
              : pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "sg-nav-link rounded-lg px-3 py-2 text-sm",
              active
                ? "sg-nav-link--active"
                : "text-zinc-400 hover:text-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
