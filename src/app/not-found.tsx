import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4">
      <EmptyState
        icon={Compass}
        title="Seite nicht gefunden"
        description="Diese Route gibt es nicht — zurück zum Überblick."
        action={{ href: "/", label: "Zum Dashboard" }}
        className="max-w-md w-full"
      />
      <Link href="/docs" className="text-sm text-zinc-500 hover:text-sky-400 hover:underline">
        Dokumentation
      </Link>
    </div>
  );
}
