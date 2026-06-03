import type { alerts } from "@/db/schema";
import { discordColorForLevel, sendDiscord } from "./discord";
import { sendEmail } from "./email";
import { sendTelegram } from "./telegram";

type AlertRow = typeof alerts.$inferSelect;

function alertPrefix(level: string): string {
  if (level === "critical") return "🔴 CRITICAL";
  if (level === "warning") return "🟡 WARNING";
  return "ℹ️ INFO";
}

function buildAlertText(alert: AlertRow): string {
  return [
    `${alertPrefix(alert.level)} [${alert.module}]`,
    alert.message,
    alert.recommendation ? `→ ${alert.recommendation}` : "",
    process.env.APP_URL ? `Dashboard: ${process.env.APP_URL}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function sendAlertNotifications(alert: AlertRow): Promise<void> {
  const text = buildAlertText(alert);
  const discordLevel =
    alert.level === "critical"
      ? "critical"
      : alert.level === "warning"
        ? "warning"
        : "info";

  await Promise.all([
    sendTelegram(text),
    sendDiscord(text, {
      title: `System Guardian — ${alert.level.toUpperCase()} · ${alert.module}`,
      color: discordColorForLevel(discordLevel),
    }),
    sendEmail(`System Guardian: ${alert.level} – ${alert.module}`, text),
  ]);
}

export async function sendDailyReportDigest(content: string): Promise<void> {
  const telegramBody = `📊 <b>Daily Report</b>\n<pre>${content.replace(/</g, "&lt;")}</pre>`;

  await Promise.all([
    sendTelegram(telegramBody),
    sendDiscord(content, {
      title: "System Guardian — Daily Report",
      color: discordColorForLevel("report"),
    }),
    sendEmail("System Guardian – Daily Report", content),
  ]);
}
