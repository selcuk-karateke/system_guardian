"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Scroll step for arrow clicks (px). */
  step?: number;
};

/**
 * Theme scroll region with clickable ↑↓ — replaces OS chrome scrollbars.
 */
export function SgScrollRail({ children, className, step = 140 }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const sync = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const hasOverflow = max > 2;
    setOverflows(hasOverflow);
    if (!hasOverflow) {
      setCanUp(false);
      setCanDown(false);
      return;
    }
    setCanUp(el.scrollTop > 2);
    setCanDown(el.scrollTop < max - 2);
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [sync, children]);

  function scrollByDir(dir: -1 | 1) {
    bodyRef.current?.scrollBy({ top: dir * step, behavior: "smooth" });
  }

  return (
    <div
      className={cn("sg-scroll-rail", className)}
      data-overflow={overflows ? "1" : "0"}
    >
      {overflows && (
        <button
          type="button"
          className="sg-scroll-rail__btn"
          aria-label="Nach oben scrollen"
          disabled={!canUp}
          onClick={() => scrollByDir(-1)}
        >
          <ChevronUp className="size-3.5" aria-hidden />
        </button>
      )}
      <div
        ref={bodyRef}
        className="sg-scroll-rail__body"
        onScroll={sync}
      >
        {children}
      </div>
      {overflows && (
        <button
          type="button"
          className="sg-scroll-rail__btn"
          aria-label="Nach unten scrollen"
          disabled={!canDown}
          onClick={() => scrollByDir(1)}
        >
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
