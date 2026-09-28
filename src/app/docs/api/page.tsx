import Link from "next/link";
import { RedocViewer } from "@/components/docs/redoc-viewer";

export default function ApiDocsPage() {
  return (
    <div className="space-y-4 max-w-none -m-2">
      <div className="flex flex-wrap items-baseline gap-3 px-2">
        <Link href="/docs" className="text-sm text-sky-400 hover:underline">
          ← Dokumentation
        </Link>
        <h1 className="text-2xl font-bold">HTTP-API</h1>
        <a
          href="/openapi.yaml"
          className="text-xs text-zinc-500 hover:text-sky-400"
        >
          openapi.yaml
        </a>
      </div>
      <RedocViewer specUrl="/openapi.yaml" />
    </div>
  );
}
