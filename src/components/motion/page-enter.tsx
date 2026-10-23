"use client";

import { usePathname } from "next/navigation";

/**
 * Soft page enter on route change — Concept fade-up curve, ops-tuned duration.
 */
export function PageEnter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="sg-page-enter">
      {children}
    </div>
  );
}
