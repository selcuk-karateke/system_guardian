"use client";

import { useState, useTransition } from "react";
import {
  testDailyReportPreview,
  testDiscordNotification,
  testTelegramNotification,
} from "@/app/actions/notifications";
import type { NotificationChannelStatus } from "@/lib/notifications/status";
import { Button } from "@/components/ui/button";

type Props = {
  status: NotificationChannelStatus;
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-emerald-400" : "bg-zinc-600"}`}
      aria-hidden
    />
  );
}

export function NotificationTestPanel({ status }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setIsError(!result.ok);
      setMessage(result.message);
    });
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2 text-sm">
        <li className="flex items-center gap-2 text-zinc-300">
          <StatusDot ok={status.telegram} />
          Telegram — TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
          <span className="text-zinc-500">
            {status.telegram ? "konfiguriert" : "nicht konfiguriert"}
          </span>
        </li>
        <li className="flex items-center gap-2 text-zinc-300">
          <StatusDot ok={status.discord} />
          Discord — DISCORD_WEBHOOK_URL
          <span className="text-zinc-500">
            {status.discord ? "konfiguriert" : "nicht konfiguriert"}
          </span>
        </li>
        <li className="flex items-center gap-2 text-zinc-300">
          <StatusDot ok={status.email} />
          E-Mail — SMTP_HOST + SMTP_TO
          <span className="text-zinc-500">
            {status.email ? "konfiguriert" : "nicht konfiguriert"}
          </span>
        </li>
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !status.telegram}
          onClick={() => run(testTelegramNotification)}
        >
          Telegram testen
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !status.discord}
          onClick={() => run(testDiscordNotification)}
        >
          Discord testen
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(testDailyReportPreview)}
        >
          Daily-Report-Format testen
        </Button>
      </div>

      {message && (
        <p className={`text-sm ${isError ? "text-amber-400" : "text-emerald-400"}`}>
          {message}
        </p>
      )}

      <p className="text-xs text-zinc-500">
        Nach Änderungen an .env.local den Dev-Server neu starten (pnpm dev).
      </p>
    </div>
  );
}
