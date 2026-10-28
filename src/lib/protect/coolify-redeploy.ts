import { db } from "@/db";
import { changeEvents } from "@/db/schema";
import {
  getCoolifyApiToken,
  getCoolifyApiUrl,
  isCoolifyRedeployConfigured,
} from "@/lib/config";

export type CoolifyRedeployResult = {
  ok: boolean;
  message: string;
  deploymentUuid?: string;
};

const UUID_RE = /^[a-z0-9]{10,40}$/i;

export function validateCoolifyResourceUuid(uuid: string): string | null {
  const u = uuid.trim();
  if (!u) return "Coolify-UUID fehlt";
  if (!UUID_RE.test(u)) return "Coolify-UUID ungültig";
  return null;
}

/**
 * Force-Rebuild via Coolify API (POST /api/v1/deploy?uuid=&force=true).
 * Behebt OS/Base-CVEs nur wenn das Dockerfile floating Tags nutzt;
 * App-Deps (next, auth, …) brauchen vorher einen Commit mit Lockfile.
 */
export async function triggerCoolifyForceRedeploy(
  serverId: string,
  resourceUuid: string,
  reason = "manual",
): Promise<CoolifyRedeployResult> {
  if (!isCoolifyRedeployConfigured()) {
    return {
      ok: false,
      message:
        "Coolify-API nicht konfiguriert — COOLIFY_API_URL + COOLIFY_API_TOKEN setzen",
    };
  }
  const invalid = validateCoolifyResourceUuid(resourceUuid);
  if (invalid) return { ok: false, message: invalid };

  const base = getCoolifyApiUrl()!.replace(/\/$/, "");
  const token = getCoolifyApiToken()!;
  const url = new URL(`${base}/api/v1/deploy`);
  url.searchParams.set("uuid", resourceUuid.trim());
  url.searchParams.set("force", "true");

  let status = 0;
  let bodyText = "";
  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    status = res.status;
    bodyText = (await res.text()).slice(0, 800);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    await audit(serverId, resourceUuid, reason, `error:${msg}`);
    return { ok: false, message: `Coolify API nicht erreichbar: ${msg}` };
  }

  let deploymentUuid: string | undefined;
  try {
    const json = JSON.parse(bodyText) as {
      deployments?: { deployment_uuid?: string }[];
      deployment_uuid?: string;
      message?: string;
    };
    deploymentUuid =
      json.deployment_uuid ?? json.deployments?.[0]?.deployment_uuid;
  } catch {
    /* plain text */
  }

  const ok = status >= 200 && status < 300;
  await audit(
    serverId,
    resourceUuid,
    reason,
    `http=${status} ${bodyText}`.slice(0, 2000),
  );

  return {
    ok,
    deploymentUuid,
    message: ok
      ? `Coolify Force-Rebuild gestartet (${resourceUuid})${deploymentUuid ? ` · deploy ${deploymentUuid}` : ""}`
      : `Coolify Deploy fehlgeschlagen (HTTP ${status}): ${bodyText || "kein Body"}`,
  };
}

async function audit(
  serverId: string,
  uuid: string,
  reason: string,
  detail: string,
) {
  await db.insert(changeEvents).values({
    serverId,
    category: "protect",
    changeType: "coolify_redeploy",
    entityKey: uuid.slice(0, 255),
    previousValue: reason.slice(0, 500),
    newValue: detail.slice(0, 2000),
  });
}
