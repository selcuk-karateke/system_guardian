import Link from "next/link";
import { Plus } from "lucide-react";

export function AddServerTile() {
  return (
    <Link
      href="/settings#servers"
      className="sg-server-tile flex min-h-[9.5rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-950/30 text-zinc-400 transition-colors hover:border-sky-700/60 hover:text-sky-300"
    >
      <Plus className="size-6 opacity-80" aria-hidden />
      <span className="text-sm font-medium">Server hinzufügen</span>
      <span className="text-xs text-zinc-600">Einstellungen → Server</span>
    </Link>
  );
}
