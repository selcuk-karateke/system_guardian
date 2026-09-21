"use client";

import { useRouter, useSearchParams } from "next/navigation";

const MODULES = [
  "",
  "security_posture",
  "docker",
  "network",
  "processes",
  "cron",
  "services",
  "logins",
  "fim",
  "server_health",
];

export function HistoryFilters({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = new URLSearchParams();
    const from = form.get("from") as string;
    const to = form.get("to") as string;
    const module = form.get("module") as string;
    const tab = form.get("tab") as string;
    if (from) next.set("from", new Date(from).toISOString());
    if (to) next.set("to", new Date(to).toISOString());
    if (module) next.set("module", module);
    if (tab) next.set("tab", tab);
    router.push(`/history?${next.toString()}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap gap-4 items-end rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
    >
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Von (UTC, datetime-local)
        <input
          type="datetime-local"
          name="from"
          defaultValue={params.get("from") ?? defaultFrom}
          className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Bis (UTC)
        <input
          type="datetime-local"
          name="to"
          defaultValue={params.get("to") ?? defaultTo}
          className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Modul
        <select
          name="module"
          defaultValue={params.get("module") ?? ""}
          className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-100"
        >
          <option value="">Alle</option>
          {MODULES.filter(Boolean).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Ansicht
        <select
          name="tab"
          defaultValue={params.get("tab") ?? "timeline"}
          className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-100"
        >
          <option value="timeline">Zeitleiste</option>
          <option value="point">Point-in-time</option>
          <option value="changes">Änderungen</option>
        </select>
      </label>
      <button
        type="submit"
        className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium"
      >
        Filtern
      </button>
    </form>
  );
}
