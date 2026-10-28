"use server";

import { revalidatePath } from "next/cache";
import { runCheckWithPersist } from "@/lib/alerts/pipeline";
import {
  runSecurityCheckBatch,
  runServerCheckBatch,
} from "@/lib/checks";
import { runCoolifyCheck } from "@/lib/checks/coolify";
import { runDockerCheck } from "@/lib/checks/docker";
import { getDefaultServerId, listActiveServers } from "@/lib/servers";

function revalidateDashboards() {
  revalidatePath("/");
  revalidatePath("/monitor");
  revalidatePath("/infrastructure");
  revalidatePath("/docker");
  revalidatePath("/security");
  revalidatePath("/notifications");
}

export type TriggerResult = {
  ok: boolean;
  message: string;
  modules?: { module: string; status: string }[];
};

async function activeServerIds(): Promise<string[]> {
  const rows = await listActiveServers();
  if (rows.length > 0) return rows.map((r) => r.id);
  return [await getDefaultServerId()];
}

export async function triggerServerChecks(): Promise<TriggerResult> {
  try {
    const ids = await activeServerIds();
    const modules: { module: string; status: string }[] = [];
    for (const serverId of ids) {
      const results = await runServerCheckBatch(serverId);
      modules.push(
        ...results.map((r) => ({ module: r.module, status: r.status })),
      );
    }
    revalidateDashboards();
    return {
      ok: true,
      message: `${modules.length} Server-Checks auf ${ids.length} Server(n)`,
      modules,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Server-Checks fehlgeschlagen",
    };
  }
}

export async function triggerSecurityChecks(): Promise<TriggerResult> {
  try {
    const ids = await activeServerIds();
    const modules: { module: string; status: string }[] = [];
    for (const serverId of ids) {
      const results = await runSecurityCheckBatch(serverId);
      modules.push(
        ...results.map((r) => ({ module: r.module, status: r.status })),
      );
    }
    revalidateDashboards();
    return {
      ok: true,
      message: `${modules.length} Security-Checks auf ${ids.length} Server(n)`,
      modules,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Security-Checks fehlgeschlagen",
    };
  }
}

export async function triggerAllChecks(): Promise<TriggerResult> {
  const server = await triggerServerChecks();
  if (!server.ok) return server;
  const security = await triggerSecurityChecks();
  if (!security.ok) return security;
  return {
    ok: true,
    message: "Alle Checks abgeschlossen (Server + Security)",
    modules: [...(server.modules ?? []), ...(security.modules ?? [])],
  };
}

/** Nur Docker + Coolify — schnell genug für die /docker-Seite nach Stop/Start. */
export async function triggerDockerRefresh(
  serverId?: string,
): Promise<TriggerResult> {
  try {
    const ids = serverId
      ? [serverId]
      : await activeServerIds();
    const modules: { module: string; status: string }[] = [];
    for (const id of ids) {
      const docker = await runCheckWithPersist(id, runDockerCheck);
      const coolify = await runCheckWithPersist(id, runCoolifyCheck);
      modules.push(
        { module: docker.module, status: docker.status },
        { module: coolify.module, status: coolify.status },
      );
    }
    revalidateDashboards();
    return {
      ok: true,
      message: `Docker-Inventar aktualisiert (${ids.length} Server)`,
      modules,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Docker-Refresh fehlgeschlagen",
    };
  }
}
