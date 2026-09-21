/** Einheitliche Anzeige — Server-Zeitzone Production (CEST/CET). */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Europe/Berlin";

export function formatAppDateTime(d: Date): string {
  return d.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIMEZONE,
  });
}

/** Zeitstempel aus `last` / wtmp (Server-lokal, keine TZ-Konvertierung). */
export function parseLastLoginTimestamp(line: string): {
  at: string | null;
  active: boolean;
} {
  const active = /still logged in/i.test(line);
  const m = line.match(
    /([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}(?::\d{2})?(?:\s+\d{4})?)/,
  );
  return { at: m?.[1]?.replace(/\s+/g, " ").trim() ?? null, active };
}
