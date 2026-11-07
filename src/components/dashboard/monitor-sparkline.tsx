"use client";

import { useId } from "react";

/** Soft sparkline area — decorative backdrop for monitor metric cards. */

const VB_W = 120;
const VB_H = 48;
const PAD_Y = 4;

function clampDomain(values: number[], fixed?: { min: number; max: number }) {
  if (fixed) return fixed;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (max === min) {
    const pad = Math.max(0.05, Math.abs(max) * 0.08);
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.12;
  return { min: min - pad, max: max + pad };
}

/** Catmull-Rom → cubic bezier path through points. */
function smoothLine(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const [x, y] = points[0]!;
    return `M ${x} ${y}`;
  }
  let d = `M ${points[0]![0]} ${points[0]![1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function buildSparkPaths(
  values: number[],
  opts?: { fixedDomain?: { min: number; max: number } },
): { line: string; area: string; end: { x: number; y: number } | null } {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) {
    return { line: "", area: "", end: null };
  }
  const { min, max } = clampDomain(clean, opts?.fixedDomain);
  const span = max - min || 1;
  const n = clean.length;
  const points: Array<[number, number]> = clean.map((v, i) => {
    const x = (i / (n - 1)) * VB_W;
    const y = VB_H - PAD_Y - ((v - min) / span) * (VB_H - PAD_Y * 2);
    return [x, y];
  });
  const line = smoothLine(points);
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const area = `${line} L ${last[0]} ${VB_H} L ${first[0]} ${VB_H} Z`;
  return { line, area, end: { x: last[0], y: last[1] } };
}

type Props = {
  values: number[];
  tone?: "ok" | "warn" | "crit";
  /** Pin Y domain (e.g. 0–100 for RAM/Disk). */
  fixedDomain?: { min: number; max: number };
  className?: string;
};

const TONE_RGB: Record<"ok" | "warn" | "crit", string> = {
  ok: "34,211,238",
  warn: "251,191,36",
  crit: "248,113,113",
};

export function MonitorSparkline({
  values,
  tone = "ok",
  fixedDomain,
  className,
}: Props) {
  const uid = useId().replace(/:/g, "");
  if (values.length < 2) return null;
  const { line, area } = buildSparkPaths(values, { fixedDomain });
  if (!line) return null;

  const rgb = TONE_RGB[tone];
  const gid = `spark-fade-${uid}`;
  const aid = `spark-area-${uid}`;

  return (
    <svg
      className={className ?? "monitor-stat-spark"}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        {/* Tips + inward fade along the time axis */}
        <linearGradient id={gid} x1="0" y1="0" x2={VB_W} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={`rgba(${rgb},0)`} />
          <stop offset="18%" stopColor={`rgba(${rgb},0.95)`} />
          <stop offset="50%" stopColor={`rgba(${rgb},0.22)`} />
          <stop offset="82%" stopColor={`rgba(${rgb},0.9)`} />
          <stop offset="100%" stopColor={`rgba(${rgb},0)`} />
        </linearGradient>
        <linearGradient id={aid} x1="0" y1="0" x2={VB_W} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={`rgba(${rgb},0)`} />
          <stop offset="18%" stopColor={`rgba(${rgb},0.14)`} />
          <stop offset="50%" stopColor={`rgba(${rgb},0.04)`} />
          <stop offset="82%" stopColor={`rgba(${rgb},0.12)`} />
          <stop offset="100%" stopColor={`rgba(${rgb},0)`} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${aid})`} className="monitor-stat-spark-area" />
      <path
        d={line}
        fill="none"
        stroke={`url(#${gid})`}
        className="monitor-stat-spark-line"
      />
    </svg>
  );
}
