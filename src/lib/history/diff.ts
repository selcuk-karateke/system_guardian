export interface DiffItem {
  changeType: "added" | "removed" | "changed";
  entityKey: string;
  previousValue?: string;
  newValue?: string;
}

export function diffStringSets(
  previous: string[],
  current: string[],
): DiffItem[] {
  const prevSet = new Set(previous);
  const currSet = new Set(current);
  const diffs: DiffItem[] = [];

  for (const key of current) {
    if (!prevSet.has(key)) {
      diffs.push({ changeType: "added", entityKey: key, newValue: key });
    }
  }
  for (const key of previous) {
    if (!currSet.has(key)) {
      diffs.push({ changeType: "removed", entityKey: key, previousValue: key });
    }
  }
  return diffs;
}

export function diffHashMaps(
  previous: Record<string, string>,
  current: Record<string, string>,
): DiffItem[] {
  const diffs: DiffItem[] = [];
  const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);

  for (const key of allKeys) {
    const prev = previous[key];
    const curr = current[key];
    if (prev === undefined && curr !== undefined) {
      diffs.push({ changeType: "added", entityKey: key, newValue: curr });
    } else if (prev !== undefined && curr === undefined) {
      diffs.push({ changeType: "removed", entityKey: key, previousValue: prev });
    } else if (prev !== curr) {
      diffs.push({
        changeType: "changed",
        entityKey: key,
        previousValue: prev,
        newValue: curr,
      });
    }
  }
  return diffs;
}
