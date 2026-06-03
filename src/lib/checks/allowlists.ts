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

/** Ports that are normal on a web/Coolify host */
export function getKnownPorts(): Set<string> {
  const raw = process.env.KNOWN_PORTS ?? "22,80,443,3000,5432,6379,8000,8080";
  return new Set(raw.split(",").map((p) => p.trim()).filter(Boolean));
}

export function isBuiltinUser(username: string): boolean {
  return BUILTIN_PASSWD_USERS.has(username);
}
