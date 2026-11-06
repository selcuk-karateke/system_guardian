"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890!@#$%^&*()-_=+{}|[]\\;':\"<>?,./`~".split(
    "",
  );

type Props = {
  text: string;
  className?: string;
  /** Scramble frames per letter before lock-in */
  cycleCount?: number;
  /** Pause before looping the scramble again (ignored when loop=false) */
  loopDelayMs?: number;
  /** When false, settle once and stop (status blurbs — no “Next_” forever). */
  loop?: boolean;
};

/**
 * Hacker-style glyph scramble → settle (CodePen lettering ticker, no jQuery).
 * Optional loop; respects prefers-reduced-motion.
 */
export function GlyphTicker({
  text,
  className,
  cycleCount = 5,
  loopDelayMs = 900,
  loop: shouldLoop = true,
}: Props) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      root.replaceChildren(document.createTextNode(text));
      return;
    }

    root.replaceChildren();
    const spans: HTMLSpanElement[] = [];
    for (const ch of text) {
      const span = document.createElement("span");
      span.dataset.orig = ch;
      if (ch === " ") {
        span.className = "is-space";
        span.textContent = "\u00a0";
      } else {
        span.textContent = "-";
      }
      root.appendChild(span);
      spans.push(span);
    }

    let cancelled = false;
    let raf = 0;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    let cycleCurrent = 0;
    let letterCurrent = 0;
    let frame = 0;

    const getChar = () =>
      CHARS[Math.floor(Math.random() * CHARS.length)] ?? "#";

    const resetLetters = () => {
      cycleCurrent = 0;
      letterCurrent = 0;
      for (const span of spans) {
        const orig = span.dataset.orig ?? "";
        span.classList.remove("done");
        if (orig === " ") {
          span.textContent = "\u00a0";
        } else {
          span.textContent = "-";
          span.style.opacity = "1";
        }
      }
    };

    const loop = () => {
      if (cancelled) return;

      // ~30fps scramble — full rAF is too noisy on TV walls
      frame++;
      if (frame % 2 === 1) {
        raf = requestAnimationFrame(loop);
        return;
      }

      for (let i = letterCurrent; i < spans.length; i++) {
        const span = spans[i]!;
        const orig = span.dataset.orig ?? "";
        if (orig === " ") continue;
        span.textContent = getChar();
        span.style.opacity = String(0.35 + Math.random() * 0.65);
      }

      if (cycleCurrent < cycleCount) {
        cycleCurrent++;
      } else if (letterCurrent < spans.length) {
        const curr = spans[letterCurrent]!;
        const orig = curr.dataset.orig ?? "";
        cycleCurrent = 0;
        if (orig === " ") {
          curr.textContent = "\u00a0";
        } else {
          curr.textContent = orig;
          curr.style.opacity = "1";
          curr.classList.add("done");
        }
        letterCurrent++;
      } else if (shouldLoop) {
        resetTimer = setTimeout(() => {
          if (cancelled) return;
          resetLetters();
          raf = requestAnimationFrame(loop);
        }, loopDelayMs);
        return;
      } else {
        return;
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [text, cycleCount, loopDelayMs, shouldLoop]);

  return (
    <span
      className={cn("monitor-glyph-ticker-wrap", className)}
      aria-label={text}
      role="status"
    >
      {/* Empty shell — scramble DOM is owned by the effect; React text
          children would wipe spans on every parent re-render. */}
      <span ref={rootRef} className="monitor-glyph-ticker" aria-hidden="true" />
      <span className="monitor-glyph-ticker-scan" aria-hidden="true" />
    </span>
  );
}
