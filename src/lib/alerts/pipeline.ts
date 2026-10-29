import { and, eq, isNull, SQL } from "drizzle-orm";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import type { AlertInput, CheckResult, AlertLevel } from "@/lib/checks/types";
import { persistCheckRun } from "@/lib/history/persist";
import { sendAlertNotifications } from "@/lib/notifications/dispatch";

const AUTO_RESOLVE_NOTE =
  "Auto-geschlossen: Ursache bei erneuter Prüfung nicht mehr vorhanden";

const LEVEL_RANK: Record<AlertLevel, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function serverIdCondition(serverId: string | null): SQL {
  return serverId == null
    ? isNull(alerts.serverId)
    : eq(alerts.serverId, serverId);
}

/** Offene Alerts, deren Message im aktuellen Check fehlt → auto-schließen. */
export function pickStaleOpenAlerts<T extends { message: string }>(
  open: T[],
  currentAlerts: AlertInput[],
): T[] {
  const currentMessages = new Set(currentAlerts.map((a) => a.message));
  return open.filter((row) => !currentMessages.has(row.message));
}

/**
 * Schließt offene Alerts eines Moduls (+ Server), deren Message im aktuellen
 * Check nicht mehr vorkommt (Zustand weg / Fehlalarm / veraltet).
 */
export async function reconcileOpenAlerts(
  serverId: string | null,
  module: string,
  currentAlerts: AlertInput[],
): Promise<number> {
  const open = await db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.module, module),
        isNull(alerts.resolvedAt),
        serverIdCondition(serverId),
      ),
    );

  if (open.length === 0) return 0;

  const stale = pickStaleOpenAlerts(open, currentAlerts);
  if (stale.length === 0) return 0;

  const now = new Date();
  for (const row of stale) {
    await db
      .update(alerts)
      .set({
        resolvedAt: now,
        recommendation: row.recommendation
          ? `${row.recommendation} · ${AUTO_RESOLVE_NOTE}`
          : AUTO_RESOLVE_NOTE,
      })
      .where(eq(alerts.id, row.id));
  }

  return stale.length;
}

export async function processAlerts(
  serverId: string | null,
  module: string,
  alertInputs: AlertInput[],
): Promise<void> {
  const now = new Date();

  for (const input of alertInputs) {
    const [existing] = await db
      .select()
      .from(alerts)
      .where(
        and(
          eq(alerts.module, module),
          eq(alerts.message, input.message),
          isNull(alerts.resolvedAt),
          serverIdCondition(serverId),
        ),
      )
      .limit(1);

    if (existing) {
      const existingRank = LEVEL_RANK[existing.level as AlertLevel] ?? 0;
      const nextRank = LEVEL_RANK[input.level] ?? 0;
      const escalate = nextRank > existingRank;
      const demote = nextRank < existingRank;

      await db
        .update(alerts)
        .set({
          lastSeenAt: now,
          ...(escalate || demote ? { level: input.level } : {}),
          ...(input.recommendation
            ? { recommendation: input.recommendation }
            : {}),
        })
        .where(eq(alerts.id, existing.id));

      // Nur bei Eskalation auf critical erneut benachrichtigen (kein Spam bei gleichem Zustand).
      if (escalate && input.level === "critical") {
        const [fresh] = await db
          .select()
          .from(alerts)
          .where(eq(alerts.id, existing.id))
          .limit(1);
        if (fresh) {
          await sendAlertNotifications(fresh);
          await db
            .update(alerts)
            .set({ notificationSent: true })
            .where(eq(alerts.id, existing.id));
        }
      }
      continue;
    }

    const [inserted] = await db
      .insert(alerts)
      .values({
        serverId,
        module,
        level: input.level,
        message: input.message,
        recommendation: input.recommendation ?? null,
        lastSeenAt: now,
      })
      .returning();

    if (
      inserted &&
      (input.level === "critical" || input.level === "warning")
    ) {
      await sendAlertNotifications(inserted);
      await db
        .update(alerts)
        .set({ notificationSent: true })
        .where(eq(alerts.id, inserted.id));
    }
  }
}

export async function runCheckWithPersist(
  serverId: string,
  runner: (serverId: string) => Promise<CheckResult>,
): Promise<CheckResult> {
  const start = Date.now();
  const result = await runner(serverId);
  await persistCheckRun(serverId, result, Date.now() - start);
  await processAlerts(serverId, result.module, result.alerts);
  await reconcileOpenAlerts(serverId, result.module, result.alerts);
  return result;
}
