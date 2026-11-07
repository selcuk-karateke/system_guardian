"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  testDailyReportPreview,
  testDiscordNotification,
  testTelegramNotification,
  updateDiscordSettingsAction,
  updateSmtpSettingsAction,
  updateTelegramSettingsAction,
} from "@/app/actions/notifications";
import type { NotificationChannelStatus } from "@/lib/notifications/status";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/lib/ui/field";
import { notifyResult } from "@/lib/ui/notify";

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

export function NotificationSettingsPanel({ status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function runSave(
    e: FormEvent<HTMLFormElement>,
    fn: (fd: FormData) => Promise<{ ok: boolean; message: string }>,
  ) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await fn(formData);
      notifyResult(result);
      if (result.ok) router.refresh();
    });
  }

  function runTest(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      notifyResult(await fn());
    });
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-2 text-sm">
        <li className="flex items-center gap-2 text-zinc-300">
          <StatusDot ok={status.telegram} />
          Telegram
          <span className="text-zinc-500">
            {status.telegram
              ? `konfiguriert${status.telegramChatId ? ` · ${status.telegramChatId}` : ""}`
              : "nicht konfiguriert"}
          </span>
        </li>
        <li className="flex items-center gap-2 text-zinc-300">
          <StatusDot ok={status.discord} />
          Discord
          <span className="text-zinc-500">
            {status.discord ? "Webhook gesetzt" : "nicht konfiguriert"}
          </span>
        </li>
        <li className="flex items-center gap-2 text-zinc-300">
          <StatusDot ok={status.email} />
          E-Mail
          <span className="text-zinc-500">
            {status.email
              ? `${status.smtpHost ?? "SMTP"} → ${status.smtpTo ?? "?"}`
              : "nicht konfiguriert"}
          </span>
        </li>
      </ul>

      <form
        onSubmit={(e) => runSave(e, updateTelegramSettingsAction)}
        className="grid gap-3 sm:grid-cols-2 border-t border-zinc-800 pt-4"
      >
        <p className="sm:col-span-2 text-xs font-medium text-zinc-300">
          Telegram
        </p>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          Bot-Token (leer = unverändert)
          <input
            name="botToken"
            type="password"
            autoComplete="new-password"
            placeholder={status.telegram ? "•••• gespeichert" : "123456:ABC…"}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          Chat-ID
          <input
            name="chatId"
            defaultValue={status.telegramChatId ?? ""}
            placeholder="-100…"
            className={fieldClass}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
          <input type="checkbox" name="clearToken" />
          Token löschen
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>
            Telegram speichern
          </Button>
        </div>
      </form>

      <form
        onSubmit={(e) => runSave(e, updateDiscordSettingsAction)}
        className="grid gap-3 sm:grid-cols-2 border-t border-zinc-800 pt-4"
      >
        <p className="sm:col-span-2 text-xs font-medium text-zinc-300">
          Discord
        </p>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          Webhook-URL (leer = unverändert)
          <input
            name="webhookUrl"
            type="password"
            autoComplete="new-password"
            placeholder={
              status.hasDiscordWebhook
                ? "•••• gespeichert"
                : "https://discord.com/api/webhooks/…"
            }
            className={fieldClass}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
          <input type="checkbox" name="clearWebhook" />
          Webhook löschen
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>
            Discord speichern
          </Button>
        </div>
      </form>

      <form
        onSubmit={(e) => runSave(e, updateSmtpSettingsAction)}
        className="grid gap-3 sm:grid-cols-2 border-t border-zinc-800 pt-4"
      >
        <p className="sm:col-span-2 text-xs font-medium text-zinc-300">SMTP</p>
        <label className="space-y-1 text-xs text-zinc-400">
          Host
          <input
            name="host"
            defaultValue={status.smtpHost ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          Port
          <input name="port" type="number" defaultValue={587} className={fieldClass} />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          User
          <input name="user" className={fieldClass} />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          Passwort (leer = unverändert)
          <input
            name="pass"
            type="password"
            autoComplete="new-password"
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          From
          <input
            name="from"
            defaultValue="system-guardian@example.com"
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          To
          <input
            name="to"
            defaultValue={status.smtpTo ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
          <input type="checkbox" name="clearPass" />
          Passwort löschen
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>
            SMTP speichern
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !status.telegram}
          onClick={() => runTest(testTelegramNotification)}
        >
          Telegram testen
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !status.discord}
          onClick={() => runTest(testDiscordNotification)}
        >
          Discord testen
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => runTest(testDailyReportPreview)}
        >
          Daily-Report-Format testen
        </Button>
      </div>

      <p className="text-xs text-zinc-500">
        Secrets verschlüsselt in der DB (
        <code className="text-zinc-400">AUTH_SECRET</code>). Kein ENV-Fallback.
      </p>
    </div>
  );
}
