import { isTrustedOutboundKey } from "@/lib/config";
import type { WallboardEvent, WallboardLevel } from "./types";
import {
  formatEventTime,
  parseEventCard,
  shortenEventMessage,
} from "./helpers";

function eventGroupKey(level: string, text: string): string {
  const norm = text
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, "IP")
    .replace(/:\d{4,5}\b/g, ":PORT")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${level}|${norm}`;
}

function groupWallboardEvents(
  raw: (WallboardEvent & { at: number })[],
): WallboardEvent[] {
  const map = new Map<
    string,
    WallboardEvent & { at: number; count: number }
  >();

  for (const e of raw) {
    const key = eventGroupKey(e.level, e.text);
    const hit = map.get(key);
    if (hit) {
      hit.count += 1;
      if (e.at > hit.at) {
        hit.at = e.at;
        hit.time = e.time;
        hit.id = e.id;
      }
    } else {
      map.set(key, { ...e, count: 1 });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, 6)
    .map(({ at: _at, count, ...e }) => {
      const text = count > 1 ? `${e.text} (×${count})` : e.text;
      const card = parseEventCard(text);
      return { ...e, text, title: card.title, detail: card.detail };
    });
}

export function shouldHideWallboardAlert(
  module: string,
  message: string,
): boolean {
  if (module !== "network") return false;
  return (
    message.includes("Neue ausgehende") && isTrustedOutboundKey(message)
  );
}

export function buildWallboardEvents(input: {
  alerts: {
    id: string;
    level: string;
    module: string;
    message: string;
    createdAt: Date;
  }[];
  changeEvents: {
    id: string;
    category: string;
    changeType: string;
    entityKey: string;
    createdAt: Date;
  }[];
}): WallboardEvent[] {
  type RawEvent = WallboardEvent & { at: number };
  const raw: RawEvent[] = [];

  for (const a of input.alerts.slice(0, 20)) {
    if (shouldHideWallboardAlert(a.module, a.message)) continue;
    const text = shortenEventMessage(
      `${a.module.replace(/_/g, " ")} — ${a.message}`,
    );
    const card = parseEventCard(text);
    raw.push({
      id: `alert-${a.id}`,
      at: a.createdAt.getTime(),
      time: formatEventTime(a.createdAt),
      level: (a.level === "critical"
        ? "critical"
        : a.level === "warning"
          ? "warning"
          : "info") as WallboardLevel,
      text,
      title: card.title,
      detail: card.detail,
    });
  }

  for (const e of input.changeEvents.slice(0, 8)) {
    const level: WallboardLevel =
      e.changeType === "removed" || e.category === "fim"
        ? "warning"
        : "info";
    const text = shortenEventMessage(
      `${e.category} ${e.changeType}: ${e.entityKey}`,
    );
    const card = parseEventCard(text);
    raw.push({
      id: `chg-${e.id}`,
      at: e.createdAt.getTime(),
      time: formatEventTime(e.createdAt),
      level,
      text,
      title: card.title,
      detail: card.detail,
    });
  }

  raw.sort((a, b) => b.at - a.at);
  return groupWallboardEvents(raw);
}
