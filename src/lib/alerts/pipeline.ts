import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import type { AlertInput, CheckResult } from "@/lib/checks/types";
import { persistCheckRun } from "@/lib/history/persist";
import { sendAlertNotifications } from "@/lib/notifications/dispatch";

const DEDUP_MS = 60 * 60 * 1000;

export async function processAlerts(
  serverId: string | null,
  module: string,
  alertInputs: AlertInput[],
): Promise<void> {
  const since = new Date(Date.now() - DEDUP_MS);

  for (const input of alertInputs) {
    const [existing] = await db
      .select()
      .from(alerts)
      .where(
        and(
          eq(alerts.module, module),
          eq(alerts.message, input.message),
          gte(alerts.createdAt, since),
        ),
      )
      .limit(1);

    if (existing && input.level !== "critical") continue;

    const [inserted] = await db
      .insert(alerts)
      .values({
        serverId,
        module,
        level: input.level,
        message: input.message,
        recommendation: input.recommendation ?? null,
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
  return result;
}
