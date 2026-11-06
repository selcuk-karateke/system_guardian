"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(
    async (prev: LoginState | null, formData: FormData) => {
      return loginAction(prev, formData);
    },
    null as LoginState | null,
  );

  const mfa = Boolean(state?.mfaRequired);

  return (
    <form
      action={formAction}
      className="sg-glass-card rounded-xl border border-zinc-800 p-6 space-y-4"
    >
      <input type="hidden" name="next" value={next ?? "/"} />
      <input type="hidden" name="step" value={mfa ? "totp" : "password"} />
      {mfa && state?.username ? (
        <input type="hidden" name="username" value={state.username} />
      ) : null}

      {!mfa ? (
        <>
          <div>
            <label htmlFor="username" className="text-sm text-zinc-400">
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm text-zinc-400">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </div>
        </>
      ) : (
        <div>
          <p className="text-sm text-zinc-300 mb-3">
            2FA für <span className="font-mono text-zinc-100">{state?.username}</span>
          </p>
          <label htmlFor="totp" className="text-sm text-zinc-400">
            Authenticator-Code
          </label>
          <input
            id="totp"
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,8}"
            placeholder="6-stelliger Code"
            required
            autoFocus
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 font-mono tracking-widest"
          />
        </div>
      )}

      {state?.error && (
        <p className="text-sm text-amber-400">{state.error}</p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "…" : mfa ? "Code bestätigen" : "Sign in"}
      </Button>
    </form>
  );
}
