import { isCoolifyManagedMeta, type CoolifyMeta } from "./coolify-meta";
import type { DiffItem } from "@/lib/history/diff";

/** Coolify Deploy-Timestamp-Suffix: -124719675385 */
const COOLIFY_DEPLOY_SUFFIX = /-\d{10,}$/;

/** Coolify app/resource id aus Container-Name */
export function coolifyResourceKey(
  containerName: string,
  meta?: CoolifyMeta,
): string | null {
  if (meta?.coolifyName) return meta.coolifyName;
  const base = containerName.replace(COOLIFY_DEPLOY_SUFFIX, "");
  // backend-{id}, frontend-{id}, oder {id}
  const role = base.match(/^(?:backend|frontend)-([a-z0-9]{10,})$/i);
  if (role) return role[1];
  const plain = base.match(/^([a-z0-9]{12,})$/);
  return plain ? plain[1] : null;
}

export function isCoolifyManagedContainer(
  containerName: string,
  meta?: CoolifyMeta,
): boolean {
  if (isCoolifyManagedMeta(meta)) return true;
  if (/^coolify(-|$)/i.test(containerName)) return true;
  if (/^(?:backend|frontend)-[a-z0-9]{10,}-\d{10,}$/i.test(containerName)) {
    return true;
  }
  return coolifyResourceKey(containerName, meta) !== null;
}

/**
 * Coolify-Deploy = gleiche Resource-ID, alter Container weg, neuer Container da.
 * Kein Security-Alert — erwartetes Verhalten.
 */
export function filterRoutineCoolifyDiffs(
  diffs: DiffItem[],
  metaByContainer: Map<string, CoolifyMeta | undefined>,
): DiffItem[] {
  const addedKeys = new Set<string>();
  const removedKeys = new Set<string>();

  for (const d of diffs) {
    const key = coolifyResourceKey(d.entityKey, metaByContainer.get(d.entityKey));
    if (!key) continue;
    if (d.changeType === "added") addedKeys.add(key);
    if (d.changeType === "removed") removedKeys.add(key);
  }

  const redeployKeys = new Set<string>();
  for (const k of addedKeys) {
    if (removedKeys.has(k)) redeployKeys.add(k);
  }

  return diffs.filter((d) => {
    const meta = metaByContainer.get(d.entityKey);
    const key = coolifyResourceKey(d.entityKey, meta);
    const managed = isCoolifyManagedContainer(d.entityKey, meta);

    if (managed && key && redeployKeys.has(key)) {
      return false;
    }

    if (managed && (d.changeType === "added" || d.changeType === "removed" || d.changeType === "changed")) {
      return false;
    }

    return true;
  });
}
