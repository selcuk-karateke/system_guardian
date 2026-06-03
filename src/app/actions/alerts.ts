"use server";

import { eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { alerts } from "@/db/schema";

function revalidateAlertViews(alertId?: string) {
  revalidatePath("/");
  revalidatePath("/monitor");
  revalidatePath("/notifications");
  if (alertId) revalidatePath(`/alerts/${alertId}`);
}

/** Einzelne Warnung manuell schließen (als unkritisch / nichtssagend markieren). */
export async function dismissAlert(
  alertId: string,
): Promise<{ ok: boolean; error?: string }> {
  const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId)).limit(1);
  if (!row) return { ok: false, error: "Alert nicht gefunden" };
  if (row.resolvedAt) return { ok: true };

  const note = "Manuell entschärft (als nichtssagend markiert)";
  await db
    .update(alerts)
    .set({
      resolvedAt: new Date(),
      recommendation: row.recommendation ? `${row.recommendation} · ${note}` : note,
    })
    .where(eq(alerts.id, alertId));

  revalidateAlertViews(alertId);
  return { ok: true };
}

export async function dismissAllOpenAlerts(): Promise<{ ok: boolean; count: number }> {
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(alerts)
    .where(isNull(alerts.resolvedAt));

  const count = countRow?.count ?? 0;

  if (count > 0) {
    await db
      .update(alerts)
      .set({ resolvedAt: new Date() })
      .where(isNull(alerts.resolvedAt));
  }

  revalidateAlertViews();
  return { ok: true, count };
}
