import {
  getNotificationPublicStatus,
  type NotificationPublicStatus,
} from "./config";

export type NotificationChannelStatus = NotificationPublicStatus;

/** @deprecated Prefer getNotificationPublicStatus (async, DB-backed). */
export function getNotificationChannelStatus(): {
  telegram: boolean;
  discord: boolean;
  email: boolean;
} {
  return {
    telegram: !!(
      process.env.TELEGRAM_BOT_TOKEN?.trim() &&
      process.env.TELEGRAM_CHAT_ID?.trim()
    ),
    discord: !!process.env.DISCORD_WEBHOOK_URL?.trim(),
    email: !!(process.env.SMTP_HOST?.trim() && process.env.SMTP_TO?.trim()),
  };
}

export { getNotificationPublicStatus };
