"use server";

import { revalidatePath } from "next/cache";
import {
  createServer,
  deactivateServer,
  listActiveServers,
  updateServerInventory,
} from "@/lib/servers";
import { updateServerSsh } from "@/lib/servers-ssh";
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
  const sshUser = String(formData.get("sshUser") ?? "").trim();
  const sshPortRaw = String(formData.get("sshPort") ?? "").trim();
  const privateKey = String(formData.get("privateKey") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const created = await createServer({
      name,
      host,
      ipv4: ipv4 || null,
      monitorProfile,
    });
    if (sshUser || sshPortRaw || privateKey.trim() || password.trim()) {
      await updateServerSsh(created.id, {
        sshUser: sshUser || null,
        sshPort: sshPortRaw ? parseInt(sshPortRaw, 10) : 22,
        privateKey: privateKey.trim() || undefined,
        password: password.trim() || undefined,
      });
    }
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

/** Per-server SSH credentials (encrypted in DB). */
export async function updateServerSshAction(
  formData: FormData,
): Promise<ServerActionResult> {
  const serverId = String(formData.get("serverId") ?? "");
  if (!serverId) return { ok: false, message: "serverId fehlt" };

  const sshUser = String(formData.get("sshUser") ?? "").trim();
  const sshPortRaw = String(formData.get("sshPort") ?? "").trim();
  const privateKey = String(formData.get("privateKey") ?? "");
  const password = String(formData.get("password") ?? "");
  const clearKey = formData.get("clearPrivateKey") === "on";
  const clearPassword = formData.get("clearPassword") === "on";
  const host = String(formData.get("host") ?? "").trim();
  const ipv4 = String(formData.get("ipv4") ?? "").trim();

  try {
    const row = await updateServerSsh(serverId, {
      host: host || undefined,
      ipv4: ipv4 || null,
      sshUser: sshUser || null,
      sshPort: sshPortRaw ? parseInt(sshPortRaw, 10) : 22,
      privateKey: privateKey.trim() || undefined,
      password: password.trim() || undefined,
      clearPrivateKey: clearKey,
      clearPassword: clearPassword,
    });
    if (!row) return { ok: false, message: "Server nicht gefunden" };
    revalidateServerViews();
    return {
      ok: true,
      message: `SSH für „${row.name}“ gespeichert`,
      id: row.id,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "SSH speichern fehlgeschlagen",
    };
  }
}

/** Align inventory host/IPv4 with global SSH_HOST (CHECK_MODE=ssh). */
export async function alignServerWithSshHostAction(
  serverId: string,
): Promise<ServerActionResult> {
  const sshHost = process.env.SSH_HOST?.trim();
  if (!sshHost) {
    return { ok: false, message: "SSH_HOST ist nicht gesetzt" };
  }
  try {
    const row = await updateServerInventory(serverId, {
      host: sshHost,
      ipv4: sshHost,
    });
    if (!row) return { ok: false, message: "Server nicht gefunden" };
    revalidateServerViews();
    return {
      ok: true,
      message: `Host/IPv4 auf SSH_HOST (${sshHost}) gesetzt`,
      id: row.id,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Update fehlgeschlagen",
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
