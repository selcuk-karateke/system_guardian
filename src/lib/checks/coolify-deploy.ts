import { isCoolifyManagedMeta, type CoolifyMeta } from "./coolify-meta";
import type { DiffItem } from "@/lib/history/diff";

/** Coolify Deploy-Timestamp-Suffix: -124719675385 */
const COOLIFY_DEPLOY_SUFFIX = /-\d{10,}$/;

/** Stable base before Coolify's numeric deploy suffix (if any). */
export function coolifyDeployBase(containerName: string): string | null {
  if (!COOLIFY_DEPLOY_SUFFIX.test(containerName)) return null;
  return containerName.replace(COOLIFY_DEPLOY_SUFFIX, "");
}

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
  // Coolify-ish: name-{resourceId} with long alphanumeric id
  const named = base.match(/^[\w.-]+-([a-z0-9]{16,})$/i);
  if (named) return named[1];
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
  // Any *-NNNNNNNNNN deploy-suffix name is Coolify churn on this host.
  if (coolifyDeployBase(containerName)) return true;
  return coolifyResourceKey(containerName, meta) !== null;
}

/**
 * Coolify-Deploy = gleiche Resource-ID / Deploy-Base, alter Container weg, neuer da.
 * Kein Security-Alert — erwartetes Verhalten.
 */
export function filterRoutineCoolifyDiffs(
  diffs: DiffItem[],
  metaByContainer: Map<string, CoolifyMeta | undefined>,
): DiffItem[] {
  const addedKeys = new Set<string>();
  const removedKeys = new Set<string>();
  const addedBases = new Set<string>();
  const removedBases = new Set<string>();

  for (const d of diffs) {
    const meta = metaByContainer.get(d.entityKey);
    const key = coolifyResourceKey(d.entityKey, meta);
    const base = coolifyDeployBase(d.entityKey);
    if (d.changeType === "added") {
      if (key) addedKeys.add(key);
      if (base) addedBases.add(base);
    }
    if (d.changeType === "removed") {
      if (key) removedKeys.add(key);
      if (base) removedBases.add(base);
    }
  }

  const redeployKeys = new Set<string>();
  for (const k of addedKeys) {
    if (removedKeys.has(k)) redeployKeys.add(k);
  }
  const redeployBases = new Set<string>();
  for (const b of addedBases) {
    if (removedBases.has(b)) redeployBases.add(b);
  }

  return diffs.filter((d) => {
    const meta = metaByContainer.get(d.entityKey);
    const key = coolifyResourceKey(d.entityKey, meta);
    const base = coolifyDeployBase(d.entityKey);
    const managed = isCoolifyManagedContainer(d.entityKey, meta);

    if (key && redeployKeys.has(key)) return false;
    if (base && redeployBases.has(base)) return false;

    // Managed Coolify inventory churn (incl. orphan remove after rotate) — not S3.
    if (
      managed &&
      (d.changeType === "added" ||
        d.changeType === "removed" ||
        d.changeType === "changed")
    ) {
      return false;
    }

    return true;
  });
}
