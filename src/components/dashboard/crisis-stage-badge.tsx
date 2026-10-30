import { Badge } from "@/components/ui/badge";
import {
  CRISIS_STAGE_META,
  type CrisisStage,
} from "@/lib/crisis/stages";
import { cn } from "@/lib/utils";

const STAGE_CLASS: Record<CrisisStage, string> = {
  1: "border-red-600/90 bg-red-950/90 text-red-200",
  2: "border-orange-600/80 bg-orange-950/80 text-orange-200",
  3: "border-amber-700/80 bg-amber-950/70 text-amber-200",
  4: "border-zinc-600/80 bg-zinc-900/80 text-zinc-300",
};

export function CrisisStageBadge({
  stage,
  showName = false,
  className,
}: {
  stage: CrisisStage;
  showName?: boolean;
  className?: string;
}) {
  const meta = CRISIS_STAGE_META[stage];
  return (
    <Badge
      variant="default"
      title={`${meta.short} · ${meta.name} — ${meta.blurb}`}
      className={cn(STAGE_CLASS[stage], className)}
    >
      {meta.short}
      {showName ? ` · ${meta.name}` : null}
    </Badge>
  );
}
