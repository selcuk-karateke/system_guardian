import { decryptSecret, encryptSecret } from "@/lib/crypto/secret";
import { getSetting, setSetting } from "@/lib/app-settings";

const TELEGRAM_KEY = "notifications.telegram";
const DISCORD_KEY = "notifications.discord";
const SMTP_KEY = "notifications.smtp";

type TelegramStored = {
  botTokenEnc?: string | null;
  chatId?: string | null;
};

type DiscordStored = {
  webhookUrlEnc?: string | null;
};

type SmtpStored = {
  host?: string | null;
  port?: number | null;
  user?: string | null;
  passEnc?: string | null;
  from?: string | null;
  to?: string | null;
};

export type TelegramCreds = { botToken: string; chatId: string };
export type DiscordCreds = { webhookUrl: string };
export type SmtpCreds = {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  from: string;
  to: string;
};

export type NotificationPublicStatus = {
  telegram: boolean;
  discord: boolean;
  email: boolean;
  telegramChatId: string | null;
  smtpHost: string | null;
  smtpTo: string | null;
  hasDiscordWebhook: boolean;
};

export async function resolveTelegramCreds(): Promise<TelegramCreds | null> {
  const stored = await getSetting<TelegramStored>(TELEGRAM_KEY);
  if (!stored?.botTokenEnc || !stored.chatId?.trim()) return null;
  try {
    const botToken = decryptSecret(stored.botTokenEnc).trim();
    const chatId = stored.chatId.trim();
    if (botToken && chatId) return { botToken, chatId };
  } catch {
    return null;
  }
  return null;
}

export async function resolveDiscordCreds(): Promise<DiscordCreds | null> {
  const stored = await getSetting<DiscordStored>(DISCORD_KEY);
  if (!stored?.webhookUrlEnc) return null;
  try {
    const webhookUrl = decryptSecret(stored.webhookUrlEnc).trim();
    if (webhookUrl) return { webhookUrl };
  } catch {
    return null;
  }
  return null;
}

export async function resolveSmtpCreds(): Promise<SmtpCreds | null> {
  const stored = await getSetting<SmtpStored>(SMTP_KEY);
  if (!stored?.host?.trim() || !stored.to?.trim()) return null;
  let pass: string | null = null;
  if (stored.passEnc) {
    try {
      pass = decryptSecret(stored.passEnc);
    } catch {
      pass = null;
    }
  }
  return {
    host: stored.host.trim(),
    port: stored.port && stored.port > 0 ? stored.port : 587,
    user: stored.user?.trim() || null,
    pass,
    from: stored.from?.trim() || "system-guardian@localhost",
    to: stored.to.trim(),
  };
}

export async function getNotificationPublicStatus(): Promise<NotificationPublicStatus> {
  const [tg, dc, smtp, storedTg, storedSmtp] = await Promise.all([
    resolveTelegramCreds(),
    resolveDiscordCreds(),
    resolveSmtpCreds(),
    getSetting<TelegramStored>(TELEGRAM_KEY),
    getSetting<SmtpStored>(SMTP_KEY),
  ]);
  return {
    telegram: Boolean(tg),
    discord: Boolean(dc),
    email: Boolean(smtp),
    telegramChatId: storedTg?.chatId?.trim() || tg?.chatId || null,
    smtpHost: storedSmtp?.host?.trim() || smtp?.host || null,
    smtpTo: storedSmtp?.to?.trim() || smtp?.to || null,
    hasDiscordWebhook: Boolean(dc),
  };
}

export type UpdateTelegramInput = {
  botToken?: string | null;
  chatId?: string | null;
  clearToken?: boolean;
};

export async function updateTelegramSettings(
  input: UpdateTelegramInput,
): Promise<void> {
  const prev = (await getSetting<TelegramStored>(TELEGRAM_KEY)) ?? {};
  const next: TelegramStored = { ...prev };
  if (input.chatId !== undefined) {
    next.chatId = input.chatId?.trim() || null;
  }
  if (input.clearToken) {
    next.botTokenEnc = null;
  } else if (typeof input.botToken === "string" && input.botToken.trim()) {
    next.botTokenEnc = encryptSecret(input.botToken.trim());
  }
  await setSetting(TELEGRAM_KEY, next);
}

export type UpdateDiscordInput = {
  webhookUrl?: string | null;
  clearWebhook?: boolean;
};

export async function updateDiscordSettings(
  input: UpdateDiscordInput,
): Promise<void> {
  const prev = (await getSetting<DiscordStored>(DISCORD_KEY)) ?? {};
  const next: DiscordStored = { ...prev };
  if (input.clearWebhook) {
    next.webhookUrlEnc = null;
  } else if (typeof input.webhookUrl === "string" && input.webhookUrl.trim()) {
    next.webhookUrlEnc = encryptSecret(input.webhookUrl.trim());
  }
  await setSetting(DISCORD_KEY, next);
}

export type UpdateSmtpInput = {
  host?: string | null;
  port?: number | null;
  user?: string | null;
  pass?: string | null;
  from?: string | null;
  to?: string | null;
  clearPass?: boolean;
};

export async function updateSmtpSettings(input: UpdateSmtpInput): Promise<void> {
  const prev = (await getSetting<SmtpStored>(SMTP_KEY)) ?? {};
  const next: SmtpStored = { ...prev };
  if (input.host !== undefined) next.host = input.host?.trim() || null;
  if (input.port !== undefined) {
    next.port =
      input.port != null && input.port > 0 && input.port < 65536
        ? input.port
        : 587;
  }
  if (input.user !== undefined) next.user = input.user?.trim() || null;
  if (input.from !== undefined) next.from = input.from?.trim() || null;
  if (input.to !== undefined) next.to = input.to?.trim() || null;
  if (input.clearPass) {
    next.passEnc = null;
  } else if (typeof input.pass === "string" && input.pass.trim()) {
    next.passEnc = encryptSecret(input.pass.trim());
  }
  await setSetting(SMTP_KEY, next);
}
