import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
};

/** Neutral loading block — prefers-reduced-motion: static. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("sg-skeleton", className)} aria-hidden />;
}

/** Dashboard-shaped placeholder while the route streams. */
export function DashboardPageSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Lädt">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-3">
          <Skeleton className="h-9 w-48" />
          <div className="flex gap-2">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="size-9 rounded-lg" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Skeleton className="h-7 w-24 rounded-full" />
          <div className="flex gap-2">
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  );
}

/** Generic settings / list page placeholder. */
export function SettingsPageSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Lädt">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    </div>
  );
}

/** Compact filter / toolbar placeholder. */
export function FilterBarSkeleton() {
  return (
    <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="Filter laden">
      <Skeleton className="h-9 w-40 rounded-md" />
      <Skeleton className="h-9 w-40 rounded-md" />
      <Skeleton className="h-9 w-28 rounded-md" />
      <Skeleton className="h-9 w-24 rounded-md" />
    </div>
  );
}
