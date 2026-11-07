import { MONITOR_MODULE_ORDER, MODULE_LABELS } from "@/lib/module-labels";

export type ModuleSectionLike = {
  id: string;
  label: string;
  modules: readonly string[];
};

/** Filter + reorder section modules from a flat preferred order. */
export function applyModuleLayout(
  sections: readonly ModuleSectionLike[],
  modules: readonly string[],
): ModuleSectionLike[] {
  const allowed = new Set(modules);
  const rank = new Map(modules.map((m, i) => [m, i]));
  return sections
    .map((s) => ({
      id: s.id,
      label: s.label,
      modules: s.modules
        .filter((m) => allowed.has(m))
        .slice()
        .sort(
          (a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999),
        ),
    }))
    .filter((s) => s.modules.length > 0);
}

export function moduleLabel(id: string): string {
  return MODULE_LABELS[id] ?? id;
}

export function allModuleIds(): string[] {
  return [...MONITOR_MODULE_ORDER];
}
