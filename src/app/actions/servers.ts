"use server";

import { revalidatePath } from "next/cache";
import {
  createServer,
  deactivateServer,
  listActiveServers,
} from "@/lib/servers";
import type { MonitorProfile } from "@/lib/monitor-profiles";

export type ServerActionResult = {
  ok: boolean;
  message: string;
  id?: string;
};

function revalidateServerViews() {
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/monitor");
  revalidatePath("/history");
  revalidatePath("/infrastructure");
  revalidatePath("/docker");
  revalidatePath("/databases");
  revalidatePath("/security");
}

export async function createServerAction(formData: FormData): Promise<ServerActionResult> {
  const name = String(formData.get("name") ?? "");
  const host = String(formData.get("host") ?? "");
  const ipv4 = String(formData.get("ipv4") ?? "");
  const monitorProfile = String(
    formData.get("monitorProfile") ?? "host",
  ) as MonitorProfile;

  try {
    const created = await createServer({
      name,
      host,
      ipv4: ipv4 || null,
      monitorProfile,
    });
    revalidateServerViews();
    return {
      ok: true,
      message: `Server „${created.name}“ angelegt`,
      id: created.id,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Anlegen fehlgeschlagen",
    };
  }
}

export async function deactivateServerAction(
  serverId: string,
): Promise<ServerActionResult> {
  try {
    const active = await listActiveServers();
    if (active.length <= 1) {
      return {
        ok: false,
        message: "Mindestens ein aktiver Server muss bleiben",
      };
    }
    const row = await deactivateServer(serverId);
    if (!row) {
      return { ok: false, message: "Server nicht gefunden" };
    }
    revalidateServerViews();
    return { ok: true, message: `Server „${row.name}“ deaktiviert` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Deaktivieren fehlgeschlagen",
    };
  }
}
