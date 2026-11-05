"use server";

import { revalidatePath } from "next/cache";
import {
  discordColorForLevel,
  sendDiscordWithDetail,
} from "@/lib/notifications/discord";
import { sendEmail } from "@/lib/notifications/email";
import { sendTelegramWithDetail } from "@/lib/notifications/telegram";
import {
  updateDiscordSettings,
  updateSmtpSettings,
  updateTelegramSettings,
} from "@/lib/notifications/config";

export type TestNotificationResult = {
  ok: boolean;
  message: string;
};

export type NotificationSettingsResult = {
  ok: boolean;
  message: string;
};

function revalidateNotificationViews() {
  revalidatePath("/settings");
  revalidatePath("/notifications");
}

export async function updateTelegramSettingsAction(
  formData: FormData,
): Promise<NotificationSettingsResult> {
  try {
    await updateTelegramSettings({
      chatId: String(formData.get("chatId") ?? ""),
      botToken: String(formData.get("botToken") ?? ""),
      clearToken: formData.get("clearToken") === "on",
    });
    revalidateNotificationViews();
    return { ok: true, message: "Telegram gespeichert" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Telegram speichern fehlgeschlagen",
    };
  }
}

export async function updateDiscordSettingsAction(
  formData: FormData,
): Promise<NotificationSettingsResult> {
  try {
    await updateDiscordSettings({
      webhookUrl: String(formData.get("webhookUrl") ?? ""),
      clearWebhook: formData.get("clearWebhook") === "on",
    });
    revalidateNotificationViews();
    return { ok: true, message: "Discord gespeichert" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Discord speichern fehlgeschlagen",
    };
  }
}

export async function updateSmtpSettingsAction(
  formData: FormData,
): Promise<NotificationSettingsResult> {
  try {
    const portRaw = String(formData.get("port") ?? "").trim();
    await updateSmtpSettings({
      host: String(formData.get("host") ?? ""),
      port: portRaw ? parseInt(portRaw, 10) : 587,
      user: String(formData.get("user") ?? ""),
      pass: String(formData.get("pass") ?? ""),
      from: String(formData.get("from") ?? ""),
      to: String(formData.get("to") ?? ""),
      clearPass: formData.get("clearPass") === "on",
    });
    revalidateNotificationViews();
    return { ok: true, message: "SMTP gespeichert" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "SMTP speichern fehlgeschlagen",
    };
  }
}

export async function testTelegramNotification(): Promise<TestNotificationResult> {
  const result = await sendTelegramWithDetail(
    "✅ <b>System Guardian Test</b>\nTelegram-Benachrichtigung funktioniert.",
  );
  if (result.ok) {
    return { ok: true, message: "Telegram-Testnachricht gesendet." };
  }
  return {
    ok: false,
    message: result.error ?? "Telegram-Test fehlgeschlagen.",
  };
}

export async function testDiscordNotification(): Promise<TestNotificationResult> {
  const result = await sendDiscordWithDetail(
    "System Guardian Test\nDiscord-Webhook funktioniert.",
    {
      title: "System Guardian — Test",
      color: discordColorForLevel("info"),
    },
  );
  if (result.ok) {
    return { ok: true, message: "Discord-Testnachricht gesendet." };
  }
  return {
    ok: false,
    message: result.error ?? "Discord-Test fehlgeschlagen.",
  };
}

export async function testDailyReportPreview(): Promise<TestNotificationResult> {
  const sample = [
    "Global: HEALTHY",
    "CPU 12% | RAM 45% | Disk 63%",
    "Checks (24h): 34",
    "Alerts: 0",
    "",
    "Recent warnings:",
    "- (Test) Keine echten Warnungen",
  ].join("\n");

  const [telegram, discord, email] = await Promise.all([
    sendTelegramWithDetail(
      `📊 <b>Daily Report (Test)</b>\n<pre>${sample.replace(/</g, "&lt;")}</pre>`,
    ),
    sendDiscordWithDetail(sample, {
      title: "System Guardian — Daily Report (Test)",
      color: discordColorForLevel("report"),
    }),
    sendEmail("System Guardian – Daily Report (Test)", sample),
  ]);

  const parts: string[] = [];
  if (telegram.ok) parts.push("Telegram ✓");
  else parts.push(`Telegram ✗ (${telegram.error ?? "Fehler"})`);
  if (discord.ok) parts.push("Discord ✓");
  else parts.push(`Discord ✗ (${discord.error ?? "Fehler"})`);
  if (email) parts.push("E-Mail ✓");
  else parts.push("E-Mail ✗ (SMTP nicht konfiguriert)");

  const ok = telegram.ok || discord.ok || email;
  return {
    ok,
    message: parts.join(" · "),
  };
}
