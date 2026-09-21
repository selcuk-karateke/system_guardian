"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

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
  const [error, setError] = useState(false);

  const copy = useCallback(async () => {
    setError(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(true);
      window.setTimeout(() => setError(false), 3000);
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
      {error ? "Kopieren fehlgeschlagen" : copied ? copiedLabel : label}
    </Button>
  );
}
