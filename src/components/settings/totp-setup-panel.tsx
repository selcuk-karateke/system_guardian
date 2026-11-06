"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmTotpSetupAction,
  disableTotpAction,
  startTotpSetupAction,
  type TotpSetupState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

const fieldClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600";

export function TotpSetupPanel({
  username,
  totpEnabled,
}: {
  username: string;
  totpEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<TotpSetupState | null>(null);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-medium text-zinc-100">Zwei-Faktor (TOTP)</p>
        <p className="text-xs text-zinc-500 mt-1">
          Angemeldet als <span className="font-mono text-zinc-300">{username}</span>
          {" · "}
          {totpEnabled ? (
            <span className="text-emerald-400">2FA aktiv</span>
          ) : (
            <span className="text-amber-400">2FA aus</span>
          )}
        </p>
      </div>

      {!totpEnabled && !state?.qrDataUrl && (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              setState(await startTotpSetupAction());
            });
          }}
        >
          {pending ? "…" : "QR-Code erzeugen"}
        </Button>
      )}

      {state?.qrDataUrl && (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.qrDataUrl}
            alt="TOTP QR Code"
            className="mx-auto rounded-md border border-zinc-700"
            width={240}
            height={240}
          />
          <p className="text-xs text-zinc-400 text-center">
            Mit Google Authenticator / Aegis / 1Password scannen
          </p>
          {state.secret && (
            <p className="text-[11px] font-mono text-zinc-500 break-all text-center">
              Manual: {state.secret}
            </p>
          )}
          <form
            className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end"
            action={(fd) => {
              startTransition(async () => {
                const next = await confirmTotpSetupAction(fd);
                setState(next);
                if (next.ok && !next.error) router.refresh();
              });
            }}
          >
            <label className="flex-1 space-y-1 text-xs text-zinc-400">
              Code zur Bestätigung
              <input
                name="totp"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className={fieldClass}
              />
            </label>
            <Button type="submit" size="sm" disabled={pending}>
              2FA aktivieren
            </Button>
          </form>
        </div>
      )}

      {totpEnabled && (
        <form
          className="grid gap-2 sm:grid-cols-2 max-w-lg"
          action={(fd) => {
            startTransition(async () => {
              const next = await disableTotpAction(fd);
              setState(next);
              if (next.ok && !next.error) router.refresh();
            });
          }}
        >
          <label className="space-y-1 text-xs text-zinc-400">
            Passwort
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={fieldClass}
            />
          </label>
          <label className="space-y-1 text-xs text-zinc-400">
            Authenticator-Code
            <input
              name="totp"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              className={fieldClass}
            />
          </label>
          <div className="sm:col-span-2">
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="text-amber-300 border-amber-800"
              disabled={pending}
            >
              2FA deaktivieren
            </Button>
          </div>
        </form>
      )}

      {state?.error && (
        <p className="text-sm text-rose-400">{state.error}</p>
      )}
      {state?.ok && !state.error && (
        <p className="text-sm text-emerald-400">{state.ok}</p>
      )}
    </div>
  );
}
