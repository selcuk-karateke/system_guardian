"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/ui/notify";

export function CopyReportButton({
  text,
  label = "Bericht kopieren",
  copiedLabel = "Kopiert!",
  variant = "outline",
  size = "sm",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  variant?: "outline" | "default" | "ghost";
  size?: "sm" | "default";
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      notify({ message: "Bericht kopiert", tone: "ok", ms: 2200 });
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      notify({
        message: "Kopieren fehlgeschlagen",
        tone: "error",
        ms: 4000,
      });
    }
  }, [text]);

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => void copy()}
      title="Vollständigen Textbericht in die Zwischenablage kopieren"
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}
