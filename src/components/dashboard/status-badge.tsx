import { Badge } from "@/components/ui/badge";
import type { GlobalStatus } from "@/lib/dashboard-data";

const LABELS: Record<GlobalStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
};

export function StatusBadge({ status }: { status: GlobalStatus }) {
  return (
    <Badge variant={status} className="text-sm px-3 py-1 font-medium">
      <span className={`sg-status-dot sg-status-dot--${status}`} aria-hidden />
      {LABELS[status]}
    </Badge>
  );
}
