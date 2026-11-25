import { unstable_cache } from "next/cache";
import { matchStackKeywords } from "./keywords";
import { parseRssItems, severityFromTitle } from "./parse-rss";
import type { AdvisoriesResult, AdvisoryItem } from "./types";

const FEEDS = [
  {
    id: "cert-bund",
    label: "CERT-Bund WID",
    url: "https://wid.cert-bund.de/content/public/securityAdvisory/rss",
  },
  {
    id: "heise-security",
    label: "Heise Security",
    url: "https://www.heise.de/security/rss/news-atom.xml",
  },
] as const;

const FETCH_MS = 12_000;
const CACHE_SEC = 30 * 60;

async function fetchFeedXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "User-Agent": "SystemGuardian/1.0 (+advisories)",
    },
    signal: AbortSignal.timeout(FETCH_MS),
    next: { revalidate: CACHE_SEC },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function toItem(
  sourceId: string,
  raw: ReturnType<typeof parseRssItems>[number],
): AdvisoryItem {
  const hay = `${raw.title} ${raw.summary}`;
  const matchedKeywords = matchStackKeywords(hay);
  return {
    id: `${sourceId}:${raw.link || raw.title}`.slice(0, 240),
    title: raw.title || "(ohne Titel)",
    link: raw.link,
    summary: raw.summary.slice(0, 280),
    publishedAt: raw.publishedAt,
    source: sourceId,
    severity: severityFromTitle(raw.title),
    matchedKeywords,
    stackRelevant: matchedKeywords.length > 0,
  };
}

async function loadAdvisoriesUncached(): Promise<AdvisoriesResult> {
  const errors: string[] = [];
  const items: AdvisoryItem[] = [];

  await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const xml = await fetchFeedXml(feed.url);
        const parsed = parseRssItems(xml, 50);
        for (const p of parsed) items.push(toItem(feed.id, p));
      } catch (e) {
        errors.push(
          `${feed.label}: ${e instanceof Error ? e.message : "fetch failed"}`,
        );
      }
    }),
  );

  items.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });

  const stackItems = items.filter((i) => i.stackRelevant);

  return {
    fetchedAt: new Date().toISOString(),
    items: items.slice(0, 40),
    stackItems: stackItems.slice(0, 25),
    errors,
    sources: FEEDS.map((f) => ({ id: f.id, label: f.label, url: f.url })),
  };
}

/** Cached ~30 min — read-only external RSS, no alerts. */
export const getAdvisories = unstable_cache(
  loadAdvisoriesUncached,
  ["advisories-rss-v1"],
  { revalidate: CACHE_SEC },
);
