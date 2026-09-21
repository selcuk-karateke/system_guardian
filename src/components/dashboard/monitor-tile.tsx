import { MODULE_LABELS } from "@/lib/module-labels";

const STATUS = {
  healthy: { label: "OK", cell: "monitor-cell--healthy", text: "monitor-cell-status--healthy" },
  warning: { label: "WARN", cell: "monitor-cell--warning", text: "monitor-cell-status--warning" },
  critical: { label: "CRIT", cell: "monitor-cell--critical", text: "monitor-cell-status--critical" },
  unknown: { label: "—", cell: "monitor-cell--unknown", text: "monitor-cell-status--unknown" },
} as const;

function defaultLines(status: string): string[] {
  if (status === "healthy") return ["operational"];
  if (status === "warning") return ["degraded"];
  if (status === "critical") return ["outage"];
  return ["no check yet"];
}

export function MonitorTile({
  module,
  status,
  details,
}: {
  module: string;
  status: string;
  details?: string[] | null;
}) {
  const s = STATUS[status as keyof typeof STATUS] ?? STATUS.unknown;
  const lines =
    details?.filter((line) => line.trim()) ?? defaultLines(status);
  const manyLines = lines.length > 3;

  return (
    <div className={`monitor-glass monitor-cell ${s.cell}`}>
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
    </div>
  );
}
