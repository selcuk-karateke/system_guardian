import { getCachedAllowlists } from "@/lib/runtime-allowlists";

/** Standard Linux users – not alerted on first sight after baseline */
export const BUILTIN_PASSWD_USERS = new Set([
  "root",
  "daemon",
  "bin",
  "sys",
  "sync",
  "games",
  "man",
  "lp",
  "mail",
  "news",
  "uucp",
  "proxy",
  "www-data",
  "backup",
  "list",
  "irc",
  "gnats",
  "nobody",
  "_apt",
  "systemd-network",
  "systemd-resolve",
  "messagebus",
  "sshd",
  "postgres",
  "redis",
  "www",
  "nginx",
]);

/** Ports that are normal on a web/app host */
export function getKnownPorts(): Set<string> {
  return new Set(getCachedAllowlists().knownPorts);
}

export function isBuiltinUser(username: string): boolean {
  return BUILTIN_PASSWD_USERS.has(username);
}
