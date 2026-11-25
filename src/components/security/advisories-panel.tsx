import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { SgScrollRail } from "@/components/ui/sg-scroll-rail";
import type { AdvisoriesResult, AdvisorySeverity } from "@/lib/advisories/types";

function severityClass(sev: AdvisorySeverity): string {
  if (sev === "critical") return "text-red-300";
  if (sev === "high") return "text-amber-300";
  if (sev === "medium") return "text-sky-300";
  return "text-zinc-500";
}

function severityLabel(sev: AdvisorySeverity): string {
  if (sev === "critical") return "kritisch";
  if (sev === "high") return "hoch";
  if (sev === "medium") return "mittel";
  if (sev === "low") return "niedrig";
  return "—";
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
}

type Props = {
  data: AdvisoriesResult;
};

export function AdvisoriesPanel({ data }: Props) {
  const primary =
    data.stackItems.length > 0 ? data.stackItems : data.items.slice(0, 12);
  const showingStack = data.stackItems.length > 0;

  return (
    <CollapsibleCard
      id="advisories"
      title="Advisories · Außenwelt"
      count={primary.length}
      summary={
        showingStack
          ? `${data.stackItems.length} Stack-Treffer`
          : `${data.items.length} Einträge`
      }
      description={
        <>
          CERT-Bund + Heise Security ·{" "}
          {showingStack
            ? "gefiltert auf euren Stack (Docker, nginx, Nextcloud, …)"
            : "kein Stack-Treffer gerade — neueste Einträge"}
          {" · "}
          Cache ~30 min · erzeugt keine Alerts
          {data.fetchedAt ? ` · Abruf ${formatWhen(data.fetchedAt)}` : ""}
          {data.errors.length > 0
            ? ` · Feed-Fehler: ${data.errors.join("; ")}`
            : ""}
        </>
      }
      contentClassName="p-0"
    >
      {primary.length === 0 ? (
        <p className="px-0 pb-2 text-sm text-zinc-500">
          Keine Advisories geladen
          {data.errors.length > 0 ? ` (${data.errors.join("; ")})` : ""}.
        </p>
      ) : (
        <SgScrollRail className="max-h-80 px-0 pb-2">
          <ul className="sg-stagger space-y-3 text-sm">
            {primary.map((item) => (
              <li
                key={item.id}
                className="border-b border-zinc-800/80 pb-3 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span
                    className={`text-[11px] font-medium ${severityClass(item.severity)}`}
                  >
                    {severityLabel(item.severity)}
                  </span>
                  <span className="text-[11px] text-zinc-600">
                    {item.source === "cert-bund" ? "CERT-Bund" : "Heise"}
                  </span>
                  {item.publishedAt && (
                    <span className="text-[11px] text-zinc-600">
                      {formatWhen(item.publishedAt)}
                    </span>
                  )}
                </div>
                {item.link ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 block font-medium text-zinc-100 hover:text-sky-300"
                  >
                    {item.title}
                  </a>
                ) : (
                  <p className="mt-0.5 font-medium text-zinc-100">{item.title}</p>
                )}
                {item.matchedKeywords.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-emerald-500/90">
                    Stack: {item.matchedKeywords.join(", ")}
                  </p>
                )}
                {item.summary && (
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500 line-clamp-2">
                    {item.summary}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </SgScrollRail>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-zinc-800/80 pt-3 text-[11px] text-zinc-600">
        {data.sources.map((s) => (
          <a
            key={s.id}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-zinc-400"
          >
            {s.label} RSS
          </a>
        ))}
        <a
          href="https://wid.cert-bund.de/portal/wid/securityadvisory"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-zinc-400"
        >
          CERT-Bund Portal
        </a>
      </div>
    </CollapsibleCard>
  );
}
