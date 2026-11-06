"use client";

import { useEffect, useRef } from "react";

const GLYPHS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%&*()+-/~{[|]}".split(
    "",
  );

type WallTone = "healthy" | "warning" | "critical";

type Props = {
  status?: WallTone;
  className?: string;
};

type Drop = {
  y: number;
  speed: number;
  /** 0 = cyan family, 1 = gold/amber family */
  hue: 0 | 1;
};

function palette(status: WallTone): { a: string; b: string } {
  if (status === "warning") {
    return { a: "rgba(251, 191, 36, 0.55)", b: "rgba(234, 179, 8, 0.35)" };
  }
  if (status === "critical") {
    return { a: "rgba(248, 113, 113, 0.5)", b: "rgba(251, 191, 36, 0.28)" };
  }
  // healthy — HUD cyan + soft gold (reference look)
  return { a: "rgba(34, 211, 238, 0.48)", b: "rgba(251, 191, 36, 0.32)" };
}

/**
 * Matrix-style glyph rain behind the globe.
 * Soft radial falloff keeps the center clear so land dots stay readable.
 */
export function MonitorMatrixRain({
  status = "healthy",
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let disposed = false;
    let drops: Drop[] = [];
    let cols = 0;
    let fontSize = 11;
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let lastTs = 0;

    const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0] ?? "#";

    const rebuild = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      cssW = parent.clientWidth;
      cssH = parent.clientHeight;
      if (cssW < 8 || cssH < 8) return;

      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      fontSize = Math.max(9, Math.round(Math.min(cssW, cssH) * 0.012));
      cols = Math.ceil(cssW / fontSize);
      drops = Array.from({ length: cols }, () => ({
        y: Math.random() * (cssH / fontSize),
        speed: 0.35 + Math.random() * 0.85,
        hue: (Math.random() > 0.62 ? 1 : 0) as 0 | 1,
      }));
      ctx.clearRect(0, 0, cssW, cssH);
    };

    /**
     * Opacity multiplier by distance from globe center (50% / 46%).
     * Near center → near 0; toward edges → 1.
     */
    const edgeWeight = (x: number, y: number) => {
      const nx = (x - cssW * 0.5) / (cssW * 0.42);
      const ny = (y - cssH * 0.46) / (cssH * 0.4);
      const r = Math.sqrt(nx * nx + ny * ny);
      if (r < 0.35) return 0.05;
      if (r < 0.7) return 0.05 + ((r - 0.35) / 0.35) * 0.45;
      return Math.min(1, 0.5 + (r - 0.7) * 0.9);
    };

    const draw = (ts: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(draw);

      if (document.hidden) return;
      // ~28fps — enough for rain, easier on TV / OLED
      if (ts - lastTs < 34) return;
      lastTs = ts;

      if (cssW < 8) return;

      // Trail wash
      ctx.fillStyle = "rgba(5, 5, 8, 0.085)";
      ctx.fillRect(0, 0, cssW, cssH);

      const colors = palette(statusRef.current);
      ctx.font = `${fontSize}px ui-monospace, monospace`;
      ctx.textBaseline = "top";

      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        if (!drop) continue;

        const x = i * fontSize;
        const y = drop.y * fontSize;
        const w = edgeWeight(x, y);
        if (w < 0.08) {
          drop.y += drop.speed;
          if (y > cssH && Math.random() > 0.96) {
            drop.y = 0;
            drop.speed = 0.35 + Math.random() * 0.85;
            drop.hue = (Math.random() > 0.62 ? 1 : 0) as 0 | 1;
          }
          continue;
        }

        // Skip some mid-field columns so the center stays sparse
        if (w < 0.4 && (i + (drop.y | 0)) % 3 !== 0) {
          drop.y += drop.speed * 0.6;
          continue;
        }

        ctx.globalAlpha = w * (0.55 + Math.random() * 0.35);
        ctx.fillStyle = drop.hue === 0 ? colors.a : colors.b;
        ctx.fillText(pick(), x, y);
        ctx.globalAlpha = 1;

        drop.y += drop.speed;
        if (y > cssH && Math.random() > 0.975) {
          drop.y = 0;
          drop.speed = 0.35 + Math.random() * 0.85;
          drop.hue = (Math.random() > 0.62 ? 1 : 0) as 0 | 1;
        }
      }
    };

    rebuild();
    raf = requestAnimationFrame(draw);

    const onResize = () => rebuild();
    const ro = new ResizeObserver(onResize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("resize", onResize);

    const onReduced = () => {
      if (reduced.matches) {
        disposed = true;
        cancelAnimationFrame(raf);
        ctx.clearRect(0, 0, cssW, cssH);
      }
    };
    reduced.addEventListener("change", onReduced);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      reduced.removeEventListener("change", onReduced);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className ?? "monitor-matrix-rain"}
      aria-hidden="true"
    />
  );
}
