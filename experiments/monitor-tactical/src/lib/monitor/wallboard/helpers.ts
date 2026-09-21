import { worstStatus } from "@/lib/config";
import type { CheckStatus } from "@/lib/checks/types";
import type { WallboardStatus } from "./types";

export function statusScore(status: string): number {
  if (status === "healthy") return 100;
  if (status === "warning") return 55;
  if (status === "critical") return 0;
  return 40;
}

export function domainScore(
  modules: readonly string[],
  statusMap: Record<string, string>,
): { score: number; status: WallboardStatus; hint: string } {
  const statuses = modules.map((m) => statusMap[m] ?? "unknown");
  const score = Math.round(
    statuses.reduce((a, s) => a + statusScore(s), 0) / statuses.length,
  );
  const status = worstStatus(statuses as CheckStatus[]);
  const bad = modules.filter((m) => {
    const s = statusMap[m];
    return s === "warning" || s === "critical";
  });
  const hint =
    bad.length === 0
      ? "All checks OK"
      : bad
          .map((m) => m.replace(/_/g, " "))
          .slice(0, 2)
          .join(" · ");
  return { score, status, hint };
}

export function formatEventTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function shortenEventMessage(msg: string, max = 72): string {
  const clean = msg.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function parseEventCard(text: string): { title: string; detail: string } {
  const clean = text.replace(/\s+/g, " ").trim();
  const dash = clean.indexOf(" — ");
  if (dash > 0) {
    return {
      title: clean.slice(0, dash).slice(0, 36).toUpperCase(),
      detail: clean.slice(dash + 3).slice(0, 80),
    };
  }
  if (clean.length <= 40) return { title: clean.toUpperCase(), detail: "" };
  return { title: clean.slice(0, 38).toUpperCase(), detail: clean.slice(38) };
}

export function moduleLabel(module: string): string {
  return module.replace(/_/g, " ").toUpperCase();
}

export function statusWord(status: CheckStatus): string {
  if (status === "healthy") return "OK";
  if (status === "warning") return "WARN";
  if (status === "critical") return "CRIT";
  return "—";
}
