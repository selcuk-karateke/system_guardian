"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Globe2,
  Monitor,
  Server,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import packageJson from "../../../package.json";

const VERSION = packageJson.version;

type FooterLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
};

const FOOTER_LINKS: FooterLink[] = [
  { href: "/docs", label: "Dokumentation", icon: BookOpen },
  { href: "/monitor", label: "Screensaver", icon: Monitor },
  { href: "/monitor/globe", label: "Globus", icon: Globe2 },
  { href: "/security", label: "Advisories", icon: ShieldAlert },
  {
    href: "https://wid.cert-bund.de/portal/wid/securityadvisory",
    label: "CERT-Bund",
    icon: ShieldCheck,
    external: true,
  },
  {
    href: "https://status.hetzner.com/",
    label: "Hetzner Status",
    icon: Server,
    external: true,
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/monitor") {
    return pathname === "/monitor" || pathname === "/monitor/";
  }
  if (href === "/monitor/globe") {
    return pathname.startsWith("/monitor/globe");
  }
  if (href === "/docs") {
    return pathname === "/docs" || pathname.startsWith("/docs/");
  }
  if (href === "/security") {
    return pathname === "/security" || pathname.startsWith("/security/");
  }
  return false;
}

export function AppFooter() {
  const pathname = usePathname();

  return (
    <footer className="sg-app-footer shrink-0 border-t border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-1 px-3 py-2 md:px-4">
        <span
          className="mr-2 hidden font-mono text-[10px] text-zinc-500 sm:inline"
          title={`System Guardian v${VERSION}`}
        >
          v{VERSION}
        </span>
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5" aria-label="Meta">
          {FOOTER_LINKS.map((item) => {
            const Icon = item.icon;
            const active = !item.external && isActive(pathname, item.href);
            const className = cn(
              "inline-flex size-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200",
              active && "bg-zinc-900 text-sky-400",
            );
            if (item.external) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={item.label}
                  aria-label={item.label}
                  className={className}
                >
                  <Icon className="size-4" aria-hidden />
                </a>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={className}
              >
                <Icon className="size-4" aria-hidden />
              </Link>
            );
          })}
        </nav>
      </div>
    </footer>
  );
}
