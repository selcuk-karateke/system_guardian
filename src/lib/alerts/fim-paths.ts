/** Pfad aus FIM-Alert-Meldung extrahieren: `FIM: /path geändert — …` */
export function parseFimPathFromAlert(message: string): string | null {
  const m = message.match(/^FIM:\s*(\S+)\s+geändert/i);
  return m?.[1] ?? null;
}

export function fimPathsFromAlerts(
  alerts: { module: string; message: string; level?: string }[],
): string[] {
  const paths = new Set<string>();
  for (const a of alerts) {
    if (a.module !== "fim") continue;
    const path = parseFimPathFromAlert(a.message);
    if (path) paths.add(path);
  }
  return [...paths];
}
