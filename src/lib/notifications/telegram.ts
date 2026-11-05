import { resolveTelegramCreds } from "./config";

export async function sendTelegram(message: string): Promise<boolean> {
  const creds = await resolveTelegramCreds();
  if (!creds) return false;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${creds.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: creds.chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendTelegramWithDetail(
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const creds = await resolveTelegramCreds();
  if (!creds) {
    return {
      ok: false,
      error:
        "Telegram nicht konfiguriert — unter Einstellungen → Benachrichtigungen setzen",
    };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${creds.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: creds.chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );

    if (res.ok) return { ok: true };

    let error = `Telegram API HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { description?: string };
      if (data.description) error = data.description;
    } catch {
      /* ignore */
    }
    return { ok: false, error };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Telegram fetch failed",
    };
  }
}
