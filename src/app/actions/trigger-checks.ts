"use server";

import { revalidatePath } from "next/cache";
import { runCheckWithPersist } from "@/lib/alerts/pipeline";
import {
  runSecurityCheckBatch,
  runServerCheckBatch,
} from "@/lib/checks";
import { runCoolifyCheck } from "@/lib/checks/coolify";
import { runDockerCheck } from "@/lib/checks/docker";
import { enqueueBackgroundJob } from "@/lib/jobs/enqueue";
import type { EnqueueResult } from "@/lib/jobs/types";
import { getDefaultServerId, listActiveServers } from "@/lib/servers";

function revalidateDashboards() {
  revalidatePath("/");
  revalidatePath("/monitor");
  revalidatePath("/infrastructure");
  revalidatePath("/docker");
  revalidatePath("/security");
  revalidatePath("/notifications");
  revalidatePath("/servers", "layout");
}

export type TriggerResult = EnqueueResult & {
  modules?: { module: string; status: string }[];
};

async function activeServerIds(): Promise<string[]> {
  const rows = await listActiveServers();
  if (rows.length > 0) return rows.map((r) => r.id);
  return [await getDefaultServerId()];
}

export async function triggerServerChecks(): Promise<TriggerResult> {
  return enqueueBackgroundJob(
    { kind: "checks_server", label: "Server-Checks" },
    async () => {
      const ids = await activeServerIds();
      let n = 0;
      for (const serverId of ids) {
        const results = await runServerCheckBatch(serverId);
        n += results.length;
      }
      revalidateDashboards();
      return `${n} Server-Checks auf ${ids.length} Server(n)`;
    },
  );
}

export async function triggerSecurityChecks(): Promise<TriggerResult> {
  return enqueueBackgroundJob(
    { kind: "checks_security", label: "Security-Checks" },
    async () => {
      const ids = await activeServerIds();
      let n = 0;
      for (const serverId of ids) {
        const results = await runSecurityCheckBatch(serverId);
        n += results.length;
      }
      revalidateDashboards();
      return `${n} Security-Checks auf ${ids.length} Server(n)`;
    },
  );
}

export async function triggerAllChecks(): Promise<TriggerResult> {
  return enqueueBackgroundJob(
    { kind: "checks_all", label: "Alle Checks" },
    async () => {
      const ids = await activeServerIds();
      let n = 0;
      for (const serverId of ids) {
        const server = await runServerCheckBatch(serverId);
        const security = await runSecurityCheckBatch(serverId);
        n += server.length + security.length;
      }
      revalidateDashboards();
      return `${n} Checks (Server + Security) auf ${ids.length} Server(n)`;
    },
  );
}

/** Nur Docker + Coolify — Inventar-Refresh für /docker. */
export async function triggerDockerRefresh(
  serverId?: string,
): Promise<TriggerResult> {
  const ids = serverId ? [serverId] : await activeServerIds();
  return enqueueBackgroundJob(
    {
      kind: "docker_refresh",
      label: "Docker-Inventar",
      serverId: ids.length === 1 ? ids[0] : undefined,
      detail: ids.length === 1 ? undefined : `${ids.length} Server`,
    },
    async () => {
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
      return `Docker-Inventar aktualisiert (${ids.length} Server)`;
    },
  );
}
