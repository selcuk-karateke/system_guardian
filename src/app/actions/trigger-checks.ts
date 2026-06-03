"use server";

import { revalidatePath } from "next/cache";
import {
  runSecurityCheckBatch,
  runServerCheckBatch,
} from "@/lib/checks";
import { getDefaultServerId } from "@/lib/servers";

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

export async function triggerServerChecks(): Promise<TriggerResult> {
  try {
    const serverId = await getDefaultServerId();
    const results = await runServerCheckBatch(serverId);
    revalidateDashboards();
    return {
      ok: true,
      message: `${results.length} Server-Checks abgeschlossen`,
      modules: results.map((r) => ({ module: r.module, status: r.status })),
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
    const serverId = await getDefaultServerId();
    const results = await runSecurityCheckBatch(serverId);
    revalidateDashboards();
    return {
      ok: true,
      message: `${results.length} Security-Checks abgeschlossen`,
      modules: results.map((r) => ({ module: r.module, status: r.status })),
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
