"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type ServerSelectOption = {
  id: string;
  name: string;
  host: string;
};

export function ServerSelect({
  servers,
  selectedId,
  className,
}: {
  servers: ServerSelectOption[];
  selectedId: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (servers.length === 0) return null;

  function onChange(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("server", id);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <label
      className={
        className ??
        "flex items-center gap-2 text-xs text-zinc-400"
      }
    >
      <span className="shrink-0">Server</span>
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-100 max-w-[16rem]"
      >
        {servers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.host})
          </option>
        ))}
      </select>
    </label>
  );
}
