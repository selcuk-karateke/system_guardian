"use client";

import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { SidebarNav } from "./sidebar-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMonitor = pathname.startsWith("/monitor");
  const isLogin = pathname.startsWith("/login");

  if (isMonitor) {
    return (
      <div className="fixed inset-0 overflow-hidden">{children}</div>
    );
  }

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="sg-shell min-h-full flex w-full">
      <aside className="sg-sidebar w-56 shrink-0 border-r border-zinc-800 flex flex-col">
        <SidebarNav />
        <div className="mt-auto p-4 border-t border-zinc-800">
          <LogoutButton />
        </div>
      </aside>
      <main className="sg-main flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
