"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createUserAction,
  deleteUserAction,
  setRoleAction,
} from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import type { AuthUserRow } from "@/lib/auth/users";

const fieldClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600";

export function UsersAdminPanel({
  users,
  currentUser,
  canManage,
}: {
  users: AuthUserRow[];
  currentUser: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await createUserAction(fd);
      setIsError(!r.ok);
      setMessage(r.message);
      if (r.ok) {
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  if (!canManage) {
    return (
      <p className="text-sm text-zinc-500">
        Nur Admins können Benutzer anlegen und Rollen ändern.
      </p>
    );
  }

  return (
    <div className="space-y-5 text-sm">
      <ul className="space-y-2">
        {users.map((u) => (
          <li
            key={u.username}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2"
          >
            <span className="font-mono text-zinc-100 min-w-[7rem]">
              {u.username}
              {u.username === currentUser ? (
                <span className="text-zinc-500"> (du)</span>
              ) : null}
            </span>
            <span className="text-xs text-zinc-500">
              {u.source}
              {u.totpEnabled ? " · 2FA" : ""}
            </span>
            <form
              className="flex items-center gap-2 ml-auto"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                startTransition(async () => {
                  const r = await setRoleAction(fd);
                  setIsError(!r.ok);
                  setMessage(r.message);
                  if (r.ok) router.refresh();
                });
              }}
            >
              <input type="hidden" name="username" value={u.username} />
              <select
                name="role"
                defaultValue={u.role}
                className={fieldClass + " w-auto py-1"}
                disabled={pending}
              >
                <option value="admin">admin</option>
                <option value="operator">operator</option>
                <option value="viewer">viewer</option>
              </select>
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                Rolle
              </Button>
            </form>
            {u.source !== "env" && u.source !== "both" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!confirm(`User „${u.username}“ löschen?`)) return;
                  const fd = new FormData(e.currentTarget);
                  startTransition(async () => {
                    const r = await deleteUserAction(fd);
                    setIsError(!r.ok);
                    setMessage(r.message);
                    if (r.ok) router.refresh();
                  });
                }}
              >
                <input type="hidden" name="username" value={u.username} />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="text-rose-300 border-rose-900"
                  disabled={pending}
                >
                  Löschen
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-4 max-w-3xl">
        <p className="sm:col-span-4 text-xs font-medium text-zinc-300">
          Neuer User (DB)
        </p>
        <input
          name="username"
          placeholder="username"
          required
          className={fieldClass}
        />
        <input
          name="password"
          type="password"
          placeholder="Passwort (min. 10)"
          required
          minLength={10}
          className={fieldClass}
        />
        <select name="role" defaultValue="viewer" className={fieldClass}>
          <option value="viewer">viewer</option>
          <option value="operator">operator</option>
          <option value="admin">admin</option>
        </select>
        <Button type="submit" size="sm" disabled={pending}>
          Anlegen
        </Button>
      </form>

      <p className="text-xs text-zinc-500">
        ENV-User (`AUTH_USERNAME` / `AUTH_USERS`) bleiben gültig. Rollen: admin =
        alles, operator = Settings ohne User-Mgmt, viewer = lesen.
      </p>

      {message && (
        <p className={isError ? "text-rose-400" : "text-emerald-400"}>
          {message}
        </p>
      )}
    </div>
  );
}
