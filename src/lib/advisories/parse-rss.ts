import type { AdvisorySeverity } from "./types";

export type ParsedRssItem = {
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagContent(block: string, tag: string): string {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    "i",
  );
  const m = block.match(re);
  return m?.[1] ? decodeXmlEntities(m[1]) : "";
}

function linkFromItem(block: string): string {
  const tagged = tagContent(block, "link");
  if (tagged.startsWith("http")) return tagged;
  const atom = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (atom?.[1]) return atom[1].trim();
  return tagged;
}

/** Minimal RSS 2.0 / Atom item extractor — no XML dependency. */
export function parseRssItems(xml: string, limit = 40): ParsedRssItem[] {
  const chunks =
    xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ??
    xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ??
    [];
  const out: ParsedRssItem[] = [];
  for (const block of chunks.slice(0, limit)) {
    const title = tagContent(block, "title");
    const link = linkFromItem(block);
    const summary =
      tagContent(block, "description") ||
      tagContent(block, "summary") ||
      tagContent(block, "content");
    const publishedRaw =
      tagContent(block, "pubDate") ||
      tagContent(block, "published") ||
      tagContent(block, "updated") ||
      tagContent(block, "dc:date");
    let publishedAt: string | null = null;
    if (publishedRaw) {
      const d = new Date(publishedRaw);
      publishedAt = Number.isNaN(d.getTime()) ? publishedRaw : d.toISOString();
    }
    if (!title && !link) continue;
    out.push({ title, link, summary, publishedAt });
  }
  return out;
}

export function severityFromTitle(title: string): AdvisorySeverity {
  const t = title.toLowerCase();
  if (/\[kritisch\]|\bcritical\b/.test(t)) return "critical";
  if (/\[hoch\]|\bhigh\b/.test(t)) return "high";
  if (/\[mittel\]|\bmedium\b|\bmoderate\b/.test(t)) return "medium";
  if (/\[niedrig\]|\blow\b/.test(t)) return "low";
  return "unknown";
}
