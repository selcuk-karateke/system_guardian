"use server";

import { revalidatePath } from "next/cache";
import { requireSettingsWrite } from "@/lib/auth/require-role";
import { updateAllowlistsConfig } from "@/lib/runtime-allowlists";
import {
  DEFAULT_THRESHOLDS,
  type ThresholdKey,
  type ThresholdsMap,
  updateThresholds,
  updateTrustedConfig,
} from "@/lib/runtime-config";

export type RuntimeConfigActionResult = {
  ok: boolean;
  message: string;
};

function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/monitor");
  revalidatePath("/security");
}

export async function updateThresholdsAction(
  formData: FormData,
): Promise<RuntimeConfigActionResult> {
  const gate = await requireSettingsWrite();
  if (!gate.ok) return { ok: false, message: gate.message };
  try {
    const patch: Partial<ThresholdsMap> = {};
    for (const key of Object.keys(DEFAULT_THRESHOLDS) as ThresholdKey[]) {
      const raw = String(formData.get(key) ?? "").trim();
      if (!raw) continue;
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, message: `${key}: ungültige Zahl` };
      }
      patch[key] = n;
    }
    await updateThresholds(patch);
    revalidate();
    return { ok: true, message: "Schwellen gespeichert" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Speichern fehlgeschlagen",
    };
  }
}

export async function updateTrustedIpsAction(
  formData: FormData,
): Promise<RuntimeConfigActionResult> {
  const gate = await requireSettingsWrite();
  if (!gate.ok) return { ok: false, message: gate.message };
  try {
    await updateTrustedConfig({
      loginIpsRaw: String(formData.get("loginIps") ?? ""),
      outboundIpsRaw: String(formData.get("outboundIps") ?? ""),
    });
    revalidate();
    return { ok: true, message: "Trusted IPs gespeichert" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Speichern fehlgeschlagen",
    };
  }
}

export async function updateAllowlistsAction(
  formData: FormData,
): Promise<RuntimeConfigActionResult> {
  const gate = await requireSettingsWrite();
  if (!gate.ok) return { ok: false, message: gate.message };
  try {
    await updateAllowlistsConfig({
      expectedStoppedContainersRaw: String(
        formData.get("expectedStoppedContainers") ?? "",
      ),
      expectedFailedUnitsRaw: String(formData.get("expectedFailedUnits") ?? ""),
      fimPathsRaw: String(formData.get("fimPaths") ?? ""),
      knownPortsRaw: String(formData.get("knownPorts") ?? ""),
      knownDockerImagePrefixesRaw: String(
        formData.get("knownDockerImagePrefixes") ?? "",
      ),
      blockedRemoteIpsRaw: String(formData.get("blockedRemoteIps") ?? ""),
      incidentIocDomainsRaw: String(formData.get("incidentIocDomains") ?? ""),
      trustedOutboundProcessesExtraRaw: String(
        formData.get("trustedOutboundProcessesExtra") ?? "",
      ),
      trustedShellProcessPatternsExtraRaw: String(
        formData.get("trustedShellProcessPatternsExtra") ?? "",
      ),
      autoBlockEnabled: formData.get("autoBlockEnabled") === "on",
      autoBlockJail: String(formData.get("autoBlockJail") ?? "sshd"),
    });
    revalidate();
    return { ok: true, message: "Allowlists gespeichert" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Speichern fehlgeschlagen",
    };
  }
}
