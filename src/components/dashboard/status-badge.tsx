import { Badge } from "@/components/ui/badge";
import type { GlobalStatus } from "@/lib/dashboard-data";

const LABELS: Record<GlobalStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
};

const ICONS: Record<GlobalStatus, string> = {
  healthy: "🟢",
  warning: "🟡",
  critical: "🔴",
};

export function StatusBadge({ status }: { status: GlobalStatus }) {
  return (
    <Badge variant={status} className="text-sm px-3 py-1">
      {ICONS[status]} {LABELS[status]}
    </Badge>
  );
}
