"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      return loginAction(formData);
    },
    null,
  );

  return (
    <form
      action={formAction}
      className="sg-glass-card rounded-xl border border-zinc-800 p-6 space-y-4"
    >
      <input type="hidden" name="next" value={next ?? "/"} />
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
      {state?.error && (
        <p className="text-sm text-amber-400">{state.error}</p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "…" : "Sign in"}
      </Button>
    </form>
  );
}
