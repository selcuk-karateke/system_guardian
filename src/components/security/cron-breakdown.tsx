type CronCheckData = {
  systemCount?: number;
  humanCount?: number;
  systemBuckets?: Record<string, number>;
  humanJobs?: Record<string, string>;
  jobCount?: number;
};

const BUCKET_LABELS: Record<string, string> = {
  "cron.daily": "cron.daily",
  "cron.weekly": "cron.weekly",
  "cron.monthly": "cron.monthly",
  "cron.hourly": "cron.hourly",
  "cron.d": "cron.d",
  "/etc/crontab": "/etc/crontab",
};

export function CronBreakdown({ data }: { data: CronCheckData | undefined }) {
  if (!data) return null;

  const systemCount = data.systemCount ?? data.jobCount ?? 0;
  const humanCount = data.humanCount ?? 0;
  const buckets = data.systemBuckets ?? {};
  const humanJobs = data.humanJobs ?? {};

  const bucketParts = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${BUCKET_LABELS[k] ?? k} ${n}`);

  return (
    <div className="mt-3 space-y-2 text-xs">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="text-zinc-400">
          System:{" "}
          <span className="text-emerald-400/90 font-medium">{systemCount}</span>
        </span>
        <span className="text-zinc-400">
          Human:{" "}
          <span
            className={
              humanCount > 0
                ? "text-amber-400 font-medium"
                : "text-emerald-400/90 font-medium"
            }
          >
            {humanCount}
          </span>
        </span>
      </div>
      {bucketParts.length > 0 && (
        <p className="text-zinc-500 leading-relaxed">
          {bucketParts.join(" · ")}
        </p>
      )}
      {humanCount === 0 && (
        <p className="text-zinc-600">
          crontab -l leer · crontabs/ leer
        </p>
      )}
      {humanCount > 0 && (
        <ul className="text-amber-300/90 space-y-1 font-mono text-[11px]">
          {Object.entries(humanJobs).map(([key, line]) => (
            <li key={key}>
              {key.split(":")[1] ?? "user"}: {line.slice(0, 100)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
