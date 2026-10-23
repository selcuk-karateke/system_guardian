"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createServerAction,
  deactivateServerAction,
} from "@/app/actions/servers";
import { Button } from "@/components/ui/button";

export type ServerAdminRow = {
  id: string;
  name: string;
  host: string;
  ipv4: string | null;
  monitorProfile: string;
};

const fieldClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600";

export function ServerAdminPanel({ servers }: { servers: ServerAdminRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setMessage(null);
    startTransition(async () => {
      const result = await createServerAction(formData);
      setIsError(!result.ok);
      setMessage(result.message);
      if (result.ok) {
        form.reset();
        router.refresh();
        if (result.id) router.push(`/servers/${result.id}`);
      }
    });
  }

  function onDeactivate(id: string, name: string) {
    if (!confirm(`Server „${name}“ wirklich deaktivieren?`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await deactivateServerAction(id);
      setIsError(!result.ok);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-2 text-sm">
        {servers.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-100 truncate">{s.name}</p>
              <p className="text-xs text-zinc-500 font-mono truncate">
                {s.ipv4 ?? s.host} · Profil {s.monitorProfile}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={pending || servers.length <= 1}
              onClick={() => onDeactivate(s.id, s.name)}
            >
              Deaktivieren
            </Button>
          </li>
        ))}
        {servers.length === 0 && (
          <li className="text-zinc-500">Noch keine Server.</li>
        )}
      </ul>

      <form onSubmit={onCreate} className="space-y-3 border-t border-zinc-800 pt-4">
        <p className="text-sm font-medium text-zinc-200">Neuen Server anlegen</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-zinc-400">
            Name
            <input
              name="name"
              required
              placeholder="z. B. Kawai Prod"
              className={fieldClass}
            />
          </label>
          <label className="space-y-1 text-xs text-zinc-400">
            Host
            <input
              name="host"
              required
              placeholder="hostname oder IP"
              className={fieldClass}
            />
          </label>
          <label className="space-y-1 text-xs text-zinc-400">
            IPv4 (optional)
            <input name="ipv4" placeholder="1.2.3.4" className={fieldClass} />
          </label>
          <label className="space-y-1 text-xs text-zinc-400">
            Monitoring-Profil
            <select name="monitorProfile" defaultValue="host" className={fieldClass}>
              <option value="host">host — voller Host</option>
              <option value="container">container — App-Fokus</option>
              <option value="full">full — alles</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-zinc-500">
          Hinweis: SSH-Checks nutzen aktuell die globalen{" "}
          <code className="text-zinc-400">SSH_*</code>-Env-Vars (ein Zielhost).
          Der Server-Eintrag steuert Inventar, Profil und Dashboard-Karten; echte
          Multi-Host-SSH-Keys folgen später.
        </p>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Speichern…" : "Server anlegen"}
        </Button>
      </form>

      {message && (
        <p className={`text-sm ${isError ? "text-amber-400" : "text-emerald-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
