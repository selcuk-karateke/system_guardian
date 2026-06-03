type DiscordSendOptions = {
  title?: string;
  color?: number;
};

const DISCORD_COLORS = {
  critical: 0xf87171,
  warning: 0xfbbf24,
  info: 0x38bdf8,
  report: 0x4ade80,
} as const;

export function discordColorForLevel(
  level: "critical" | "warning" | "info" | "report",
): number {
  return DISCORD_COLORS[level];
}

export async function sendDiscord(
  text: string,
  options?: DiscordSendOptions,
): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!url) return false;

  const trimmed = text.trim().slice(0, 4096);
  const body = options?.title
    ? {
        embeds: [
          {
            title: options.title.slice(0, 256),
            description: trimmed,
            color: options.color ?? DISCORD_COLORS.info,
            timestamp: new Date().toISOString(),
          },
        ],
      }
    : { content: trimmed.slice(0, 2000) };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return res.ok;
}

export async function sendDiscordWithDetail(
  text: string,
  options?: DiscordSendOptions,
): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!url) {
    return { ok: false, error: "DISCORD_WEBHOOK_URL fehlt in .env.local" };
  }

  const ok = await sendDiscord(text, options);
  if (ok) return { ok: true };
  return { ok: false, error: "Discord Webhook HTTP-Fehler — URL prüfen" };
}
