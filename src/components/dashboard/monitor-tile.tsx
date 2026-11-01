import Link from "next/link";
import { getModulePageForAlert } from "@/lib/alert-routes";
import type { CrisisStage } from "@/lib/crisis/stages";
import {
  MODULE_LABELS,
  MONITOR_PLACEHOLDER_MODULES,
} from "@/lib/module-labels";

type TileSeverity = CrisisStage | "ok" | "unknown";

const PLACEHOLDERS = new Set<string>(MONITOR_PLACEHOLDER_MODULES);

const STATUS: Record<
  TileSeverity,
  { label: string; cell: string; text: string }
> = {
  ok: {
    label: "OK",
    cell: "monitor-cell--healthy",
    text: "monitor-cell-status--healthy",
  },
  4: {
    label: "S4",
    cell: "monitor-cell--warning",
    text: "monitor-cell-status--warning",
  },
  3: {
    label: "S3",
    cell: "monitor-cell--warning",
    text: "monitor-cell-status--warning",
  },
  2: {
    label: "S2",
    cell: "monitor-cell--critical",
    text: "monitor-cell-status--critical",
  },
  1: {
    label: "S1",
    cell: "monitor-cell--critical",
    text: "monitor-cell-status--critical",
  },
  unknown: {
    label: "—",
    cell: "monitor-cell--unknown",
    text: "monitor-cell-status--unknown",
  },
};

function defaultLines(severity: TileSeverity): string[] {
  if (severity === "ok") return ["operational"];
  if (severity === 4) return ["routine"];
  if (severity === 3) return ["degraded"];
  if (severity === 2) return ["severe"];
  if (severity === 1) return ["emergency"];
  return ["no check yet"];
}

export function MonitorTile({
  module,
  severity,
  details,
}: {
  module: string;
  /** Crisis stage for open alerts on this module, or ok / unknown. */
  severity: TileSeverity;
  details?: string[] | null;
}) {
  const s = STATUS[severity] ?? STATUS.unknown;
  const lines =
    details?.filter((line) => line.trim()) ?? defaultLines(severity);
  const manyLines = lines.length > 3;
  const href = PLACEHOLDERS.has(module)
    ? null
    : getModulePageForAlert(module).href;
  const className = `monitor-glass monitor-cell ${s.cell}${href ? " monitor-cell-link" : ""}`;

  const body = (
    <>
      <div className="monitor-cell-main">
        <span className="monitor-cell-name">
          {MODULE_LABELS[module] ?? module}
        </span>
        <div
          className={`monitor-cell-details${manyLines ? " monitor-cell-details--many" : ""}`}
        >
          {lines.map((line, i) => (
            <span
              key={`${i}-${line}`}
              className="monitor-cell-detail"
              title={line}
            >
              {line}
            </span>
          ))}
        </div>
      </div>
      <span className={`monitor-cell-status monitor-cell-status-ring ${s.text}`}>
        {s.label}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={className}
        title={`Open ${getModulePageForAlert(module).label}`}
      >
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
