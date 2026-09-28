/**
 * Roadmap backlog — single source: docs/backlog.json
 * Collaborators add ideas via PR on that file; UI reads it at /docs/roadmap.
 */
import { readFileSync } from "fs";
import { join } from "path";

export type RoadmapStatus = "idea" | "planned" | "in_progress" | "done";
export type RoadmapArea =
  | "monitoring"
  | "security"
  | "ux"
  | "ops"
  | "other";

export type RoadmapItem = {
  id: string;
  title: string;
  status: RoadmapStatus;
  proposedBy: string;
  area: RoadmapArea;
  notes?: string;
};

type BacklogFile = { items: RoadmapItem[] };

const STATUSES = new Set<RoadmapStatus>([
  "idea",
  "planned",
  "in_progress",
  "done",
]);
const AREAS = new Set<RoadmapArea>([
  "monitoring",
  "security",
  "ux",
  "ops",
  "other",
]);

export function loadRoadmapItems(): RoadmapItem[] {
  const path = join(process.cwd(), "docs/backlog.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as BacklogFile;
  if (!Array.isArray(raw.items)) {
    throw new Error("docs/backlog.json: items[] fehlt");
  }
  return raw.items;
}

export function assertValidRoadmapItems(items: RoadmapItem[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)) {
      errors.push(`ungültige id: ${JSON.stringify(item.id)}`);
    }
    if (ids.has(item.id)) errors.push(`doppelte id: ${item.id}`);
    ids.add(item.id);
    if (!item.title?.trim()) errors.push(`${item.id}: title fehlt`);
    if (!STATUSES.has(item.status)) {
      errors.push(`${item.id}: status ungültig (${item.status})`);
    }
    if (!item.proposedBy?.trim()) {
      errors.push(`${item.id}: proposedBy fehlt`);
    }
    if (!AREAS.has(item.area)) {
      errors.push(`${item.id}: area ungültig (${item.area})`);
    }
  }
  return errors;
}

const STATUS_ORDER: Record<RoadmapStatus, number> = {
  in_progress: 0,
  planned: 1,
  idea: 2,
  done: 3,
};

export function sortedRoadmapItems(items: RoadmapItem[]): RoadmapItem[] {
  return [...items].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  );
}

export const ROADMAP_STATUS_LABEL: Record<RoadmapStatus, string> = {
  idea: "Idee",
  planned: "Geplant",
  in_progress: "In Arbeit",
  done: "Erledigt",
};

export const ROADMAP_AREA_LABEL: Record<RoadmapArea, string> = {
  monitoring: "Monitoring",
  security: "Security",
  ux: "UX",
  ops: "Ops",
  other: "Sonstiges",
};
