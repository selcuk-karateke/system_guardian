export type NotificationChannelStatus = {
  telegram: boolean;
  discord: boolean;
  email: boolean;
};

export function getNotificationChannelStatus(): NotificationChannelStatus {
  return {
    telegram: !!(
      process.env.TELEGRAM_BOT_TOKEN?.trim() &&
      process.env.TELEGRAM_CHAT_ID?.trim()
    ),
    discord: !!process.env.DISCORD_WEBHOOK_URL?.trim(),
    email: !!(
      process.env.SMTP_HOST?.trim() && process.env.SMTP_TO?.trim()
    ),
  };
}
