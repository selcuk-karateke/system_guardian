"use server";

import { eq, isNull, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { dismissAlert, dismissAllOpenAlerts } from "@/app/actions/alerts";
import {
  runSecurityCheckBatch,
  runServerCheckBatch,
} from "@/lib/checks";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { getCheckMode } from "@/lib/config";
import { getDefaultServerId } from "@/lib/servers";
import { getSshClient } from "@/lib/ssh";

export type MonitorQuickResult = {
  ok: boolean;
  message: string;
  output?: string;
};

function revalidateMonitor() {
  revalidatePath("/monitor");
  revalidatePath("/");
  revalidatePath("/notifications");
}

export async function refreshMonitorView(): Promise<MonitorQuickResult> {
  revalidateMonitor();
  return { ok: true, message: "Monitor aktualisiert" };
}

/** Bewusste Wartung (User gelöscht, passwd ok): Alerts zu + neue Baselines */
export async function settleAfterMaintenance(): Promise<MonitorQuickResult> {
  const { count } = await dismissAllOpenAlerts();
  const serverId = await getDefaultServerId();
  await runServerCheckBatch(serverId);
  await runSecurityCheckBatch(serverId);
  revalidateMonitor();
  return {
    ok: true,
    message: `${count} Alert(s) geschlossen, Checks neu — Baselines aktualisiert`,
  };
}

export async function dismissAlertsForModule(
  module: string,
): Promise<MonitorQuickResult> {
  const rows = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.module, module), isNull(alerts.resolvedAt)));

  let n = 0;
  for (const row of rows) {
    const r = await dismissAlert(row.id);
    if (r.ok) n++;
  }

  revalidateMonitor();
  return {
    ok: true,
    message:
      n > 0
        ? `${n} Alert(s) für ${module} entschärft`
        : `Keine offenen Alerts für ${module}`,
  };
}

/** Read-only: who + w auf dem SSH-Host */
export async function probeSshSessions(): Promise<MonitorQuickResult> {
  if (getCheckMode() !== "ssh") {
    return {
      ok: false,
      message: "Nur mit CHECK_MODE=ssh in .env.local",
    };
  }

  const ssh = getSshClient();
  const { stdout, stderr, code } = await ssh.exec(
    "echo '=== who ==='; who 2>/dev/null; echo '=== w ==='; w -h 2>/dev/null | head -20; echo '=== ssh :22 (estab) ==='; ss -tnp sport = :22 2>/dev/null | head -15",
    25_000,
  );

  if (code !== 0 && !stdout.trim()) {
    return { ok: false, message: stderr.trim() || "SSH-Befehl fehlgeschlagen" };
  }

  return {
    ok: true,
    message: "SSH-Sitzungen geladen",
    output: stdout.trim().slice(0, 4000),
  };
}

/** Read-only: fail2ban sshd Kurzstatus */
export async function probeFail2ban(): Promise<MonitorQuickResult> {
  if (getCheckMode() !== "ssh") {
    return { ok: false, message: "Nur mit CHECK_MODE=ssh" };
  }

  const ssh = getSshClient();
  const { stdout } = await ssh.exec(
    "fail2ban-client status sshd 2>/dev/null | grep -E 'Currently (failed|banned)|Total (failed|banned)' || echo 'fail2ban nicht verfügbar'",
    15_000,
  );

  return {
    ok: true,
    message: "fail2ban",
    output: stdout.trim(),
  };
}

/** Read-only: Docker Kurzüberblick */
export async function probeDockerSummary(): Promise<MonitorQuickResult> {
  if (getCheckMode() !== "ssh") {
    return { ok: false, message: "Nur mit CHECK_MODE=ssh" };
  }

  const ssh = getSshClient();
  const { stdout } = await ssh.exec(
    "echo running: $(docker ps -q | wc -l) total: $(docker ps -aq | wc -l); docker ps -a --format '{{.Names}} {{.State}}' | grep -v running | head -8",
    30_000,
  );

  return {
    ok: true,
    message: "Docker",
    output: stdout.trim(),
  };
}
