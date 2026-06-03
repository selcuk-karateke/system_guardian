"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/infrastructure", label: "Infrastruktur" },
  { href: "/docker", label: "Docker" },
  { href: "/databases", label: "Datenbanken" },
  { href: "/security", label: "Sicherheit" },
  { href: "/notifications", label: "Benachrichtigungen" },
  { href: "/settings", label: "Einstellungen" },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-4">
      <div className="mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        System Guardian
      </div>
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-lg px-3 py-2 text-sm transition-colors",
            pathname === item.href
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-white",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
