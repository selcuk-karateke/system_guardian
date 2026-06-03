import type { alerts } from "@/db/schema";
import { sendEmail } from "./email";
import { sendTelegram } from "./telegram";

type AlertRow = typeof alerts.$inferSelect;

export async function sendAlertNotifications(alert: AlertRow): Promise<void> {
  const prefix =
    alert.level === "critical"
      ? "🔴 CRITICAL"
      : alert.level === "warning"
        ? "🟡 WARNING"
        : "ℹ️ INFO";

  const text = [
    `${prefix} [${alert.module}]`,
    alert.message,
    alert.recommendation ? `→ ${alert.recommendation}` : "",
    process.env.APP_URL ? `Dashboard: ${process.env.APP_URL}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await Promise.all([
    sendTelegram(text),
    sendEmail(`System Guardian: ${alert.level} – ${alert.module}`, text),
  ]);
}

export async function sendDailyReportDigest(content: string): Promise<void> {
  await Promise.all([
    sendTelegram(`📊 <b>Daily Report</b>\n${content}`),
    sendEmail("System Guardian – Daily Report", content),
  ]);
}
