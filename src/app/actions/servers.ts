"use server";

import { revalidatePath } from "next/cache";
import {
  createServer,
  deactivateServer,
  listActiveServers,
  updateServerInventory,
} from "@/lib/servers";
import { updateServerBackup } from "@/lib/servers-backup";
import { updateServerCoolify } from "@/lib/servers-coolify";
import { updateServerSsh } from "@/lib/servers-ssh";
import type { MonitorProfile } from "@/lib/monitor-profiles";
import { validateBackupTriggerCommand } from "@/lib/protect/backup-trigger";
import { rotateAgentToken } from "@/lib/agent/token";
import { installAgentViaSsh } from "@/lib/agent/install-via-ssh";
import { requireSettingsWrite } from "@/lib/auth/require-role";

export type ServerActionResult = {
  ok: boolean;
  message: string;
  id?: string;
  /** Plaintext agent token — only present right after mint/rotate. */
  agentToken?: string;
  agentInstallCmd?: string;
  warning?: string;
};

function appBaseUrl(): string {
  return (process.env.APP_URL ?? "").replace(/\/$/, "") || "https://YOUR_GUARDIAN_HOST";
}

function agentInstallCmd(serverId: string, token: string): string {
  const base = appBaseUrl();
  return `curl -fsSL ${base}/api/agent/install.sh | sudo bash -s -- --url ${base} --token ${token} --server ${serverId}`;
}

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
  const gate = await requireSettingsWrite();
  if (!gate.ok) return { ok: false, message: gate.message };

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
    const wantsSsh =
      Boolean(sshUser || sshPortRaw || privateKey.trim() || password.trim());
    if (wantsSsh) {
      await updateServerSsh(created.id, {
        sshUser: sshUser || null,
        sshPort: sshPortRaw ? parseInt(sshPortRaw, 10) : 22,
        privateKey: privateKey.trim() || undefined,
        password: password.trim() || undefined,
      });
    }

    // With SSH creds: one-click push agent. Else mint token + show manual cmd.
    if (wantsSsh && (privateKey.trim() || password.trim())) {
      const installed = await installAgentViaSsh(created.id);
      revalidateServerViews();
      return {
        ok: installed.ok,
        message: installed.ok
          ? `Server „${created.name}“ angelegt — ${installed.message}`
          : `Server angelegt, Agent-Install: ${installed.message}`,
        id: created.id,
        agentToken: installed.agentToken,
        agentInstallCmd: installed.agentInstallCmd,
        warning: installed.warning,
      };
    }

    const minted = await rotateAgentToken(created.id);
    revalidateServerViews();
    return {
      ok: true,
      message: `Server „${created.name}“ angelegt`,
      id: created.id,
      agentToken: minted?.token,
      agentInstallCmd: minted
        ? agentInstallCmd(created.id, minted.token)
        : undefined,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Anlegen fehlgeschlagen",
    };
  }
}

/** Mint/rotate metrics-agent token (plaintext returned once). */
export async function rotateAgentTokenAction(
  serverId: string,
): Promise<ServerActionResult> {
  if (!serverId) return { ok: false, message: "serverId fehlt" };
  try {
    const minted = await rotateAgentToken(serverId);
    if (!minted) return { ok: false, message: "Server nicht gefunden" };
    revalidateServerViews();
    return {
      ok: true,
      message: "Agent-Token neu ausgestellt — Install-Befehl kopieren",
      id: serverId,
      agentToken: minted.token,
      agentInstallCmd: agentInstallCmd(serverId, minted.token),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Token fehlgeschlagen",
    };
  }
}

/** One-click: mint token + push agent over SSH + enable systemd. */
export async function installAgentViaSshAction(
  serverId: string,
): Promise<ServerActionResult> {
  const gate = await requireSettingsWrite();
  if (!gate.ok) return { ok: false, message: gate.message };
  if (!serverId) return { ok: false, message: "serverId fehlt" };
  try {
    const result = await installAgentViaSsh(serverId);
    revalidateServerViews();
    return {
      ok: result.ok,
      message: result.warning
        ? `${result.message} — ${result.warning}`
        : result.message,
      id: serverId,
      agentToken: result.agentToken,
      agentInstallCmd: result.agentInstallCmd,
      warning: result.warning,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Agent-Install fehlgeschlagen",
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

/** Per-server Coolify API URL + token (token encrypted). */
export async function updateServerCoolifyAction(
  formData: FormData,
): Promise<ServerActionResult> {
  const serverId = String(formData.get("serverId") ?? "");
  if (!serverId) return { ok: false, message: "serverId fehlt" };

  const apiUrl = String(formData.get("coolifyApiUrl") ?? "");
  const apiToken = String(formData.get("coolifyApiToken") ?? "");
  const clearToken = formData.get("clearCoolifyToken") === "on";

  try {
    const row = await updateServerCoolify(serverId, {
      apiUrl,
      apiToken: apiToken.trim() || undefined,
      clearToken,
    });
    if (!row) return { ok: false, message: "Server nicht gefunden" };
    revalidateServerViews();
    return {
      ok: true,
      message: `Coolify für „${row.name}“ gespeichert`,
      id: row.id,
    };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error ? e.message : "Coolify speichern fehlgeschlagen",
    };
  }
}

/** Per-server backup paths / monitoring dir / trigger. */
export async function updateServerBackupAction(
  formData: FormData,
): Promise<ServerActionResult> {
  const serverId = String(formData.get("serverId") ?? "");
  if (!serverId) return { ok: false, message: "serverId fehlt" };

  const paths = String(formData.get("backupPaths") ?? "");
  const monitoringDir = String(formData.get("backupMonitoringDir") ?? "");
  const triggerCommand = String(formData.get("backupTriggerCommand") ?? "");
  const clearTrigger = formData.get("clearBackupTrigger") === "on";

  if (triggerCommand.trim() && !clearTrigger) {
    const invalid = validateBackupTriggerCommand(triggerCommand);
    if (invalid) return { ok: false, message: invalid };
  }

  try {
    const row = await updateServerBackup(serverId, {
      paths,
      monitoringDir,
      triggerCommand: clearTrigger ? null : triggerCommand,
      clearTrigger,
    });
    if (!row) return { ok: false, message: "Server nicht gefunden" };
    revalidateServerViews();
    return {
      ok: true,
      message: `Backup-Config für „${row.name}“ gespeichert`,
      id: row.id,
    };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error ? e.message : "Backup-Config speichern fehlgeschlagen",
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
