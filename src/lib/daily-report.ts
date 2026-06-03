import { desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { alerts, checkRuns, dailyReports, metricsSnapshots } from "@/db/schema";
import { sendDailyReportDigest } from "@/lib/notifications/dispatch";
import { worstStatus } from "@/lib/config";
import type { CheckStatus } from "@/lib/checks/types";

export async function generateAndSendDailyReport(
  serverId: string,
): Promise<{ ok: boolean; content: string }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const recentChecks = await db
    .select()
    .from(checkRuns)
    .where(eq(checkRuns.serverId, serverId))
    .orderBy(desc(checkRuns.createdAt))
    .limit(50);

  const openAlerts = await db
    .select()
    .from(alerts)
    .where(gte(alerts.createdAt, since))
    .orderBy(desc(alerts.createdAt))
    .limit(20);

  const [latestMetrics] = await db
    .select()
    .from(metricsSnapshots)
    .where(eq(metricsSnapshots.serverId, serverId))
    .orderBy(desc(metricsSnapshots.createdAt))
    .limit(1);

  const statuses = recentChecks.map((c) => c.status as CheckStatus);
  const globalStatus = worstStatus(statuses.length ? statuses : ["healthy"]);

  const lines = [
    `Global: ${globalStatus.toUpperCase()}`,
    latestMetrics
      ? `CPU ${latestMetrics.cpuPercent}% | RAM ${latestMetrics.ramPercent}% | Disk ${latestMetrics.diskPercent}%`
      : "Metrics: n/a",
    `Checks (24h): ${recentChecks.length}`,
    `Alerts: ${openAlerts.length}`,
    "",
    "Recent warnings:",
    ...openAlerts
      .filter((a) => a.level !== "info")
      .slice(0, 10)
      .map((a) => `- [${a.level}] ${a.module}: ${a.message}`),
  ];

  const content = lines.join("\n");

  await db.insert(dailyReports).values({
    content: { text: content, globalStatus },
    sentAt: new Date(),
  });

  await sendDailyReportDigest(content);

  return { ok: true, content };
}
