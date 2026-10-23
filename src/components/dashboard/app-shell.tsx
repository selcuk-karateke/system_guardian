"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftOpen, X } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { PageEnter } from "@/components/motion/page-enter";
import { cn } from "@/lib/utils";
import { SidebarNav } from "./sidebar-nav";

const STORAGE_KEY = "sg-sidebar-collapsed";
const COLLAPSE_MQ = "(max-width: 1100px)";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMonitor = pathname.startsWith("/monitor");
  const isLogin = pathname.startsWith("/login");

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const userPinnedRef = useRef<boolean | null>(null);

  useEffect(() => {
    let stored: boolean | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "1") stored = true;
      if (raw === "0") stored = false;
    } catch {
      /* ignore */
    }
    userPinnedRef.current = stored;

    const mq = window.matchMedia(COLLAPSE_MQ);
    const apply = () => {
      if (userPinnedRef.current !== null) {
        setCollapsed(userPinnedRef.current);
        return;
      }
      setCollapsed(mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    setHydrated(true);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      userPinnedRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  if (isMonitor) {
    return (
      <div className="fixed inset-0 overflow-hidden">{children}</div>
    );
  }

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div
      className={cn(
        "sg-shell flex h-dvh max-h-dvh w-full overflow-hidden",
        collapsed && "sg-shell--collapsed",
        hydrated && "sg-shell--ready",
      )}
    >
      <aside className="sg-sidebar relative z-20 hidden h-dvh shrink-0 flex-col border-r border-zinc-800 md:flex">
        <SidebarNav
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
        <div
          className={cn(
            "sg-sidebar-footer shrink-0 border-t border-zinc-800",
            collapsed ? "p-2" : "p-3",
          )}
        >
          <LogoutButton compact={collapsed} />
        </div>

        {collapsed && (
          <button
            type="button"
            className="sg-sidebar-edge-toggle"
            onClick={toggleCollapsed}
            aria-label="Sidebar ausklappen"
            title="Ausklappen"
          >
            <PanelLeftOpen className="size-3.5" aria-hidden />
          </button>
        )}
      </aside>

      <div className="sg-mobile-bar fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-3 border-b border-zinc-800 bg-zinc-950/95 px-3 backdrop-blur md:hidden">
        <button
          type="button"
          className="sg-nav-toggle"
          aria-label="Menü öffnen"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <span className="text-sm font-semibold tracking-wide text-zinc-200">
          System Guardian
        </span>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="sg-drawer-backdrop absolute inset-0"
            aria-label="Menü schließen"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="sg-drawer-panel sg-sidebar absolute inset-y-0 left-0 flex h-dvh w-[min(18rem,88vw)] flex-col border-r border-zinc-800">
            <div className="flex shrink-0 items-center justify-end border-b border-zinc-800 p-2">
              <button
                type="button"
                className="sg-nav-toggle"
                aria-label="Menü schließen"
                onClick={() => setMobileOpen(false)}
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <SidebarNav
              collapsed={false}
              onToggleCollapse={toggleCollapsed}
              showCollapseToggle={false}
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="sg-sidebar-footer shrink-0 border-t border-zinc-800 p-3">
              <LogoutButton />
            </div>
          </aside>
        </div>
      )}

      <main className="sg-main min-h-0 min-w-0 flex-1 overflow-auto p-6 pt-16 md:p-8 md:pt-8">
        <PageEnter>{children}</PageEnter>
      </main>
    </div>
  );
}
