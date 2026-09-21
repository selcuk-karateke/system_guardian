import { isTrustedLoginIp } from "@/lib/config";
import { parseLastLoginTimestamp } from "@/lib/datetime";

export type ParsedRootLogin = {
  ip: string;
  masked: string;
  trusted: boolean;
  line: string;
  at: string | null;
  active: boolean;
};

export function parseRootLoginLine(
  line: string,
  _trustedIps: Set<string>,
  maskIp: (ip: string) => string,
): ParsedRootLogin | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("root ")) return null;
  const ipMatch = trimmed.match(/\d+\.\d+\.\d+\.\d+/);
  if (!ipMatch) return null;
  const ip = ipMatch[0];
  const { at, active } = parseLastLoginTimestamp(trimmed);
  return {
    ip,
    masked: maskIp(ip),
    trusted: isTrustedLoginIp(ip),
    line: trimmed,
    at,
    active,
  };
}

export function formatRootLoginAlertDetail(login: ParsedRootLogin): string {
  const when = login.at
    ? ` um ${login.at}${login.active ? " (noch aktiv)" : ""}`
    : "";
  return `${login.masked}${when}`;
}
