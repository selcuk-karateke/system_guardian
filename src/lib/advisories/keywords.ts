/**
 * Stack keywords for Coolify / Guardian hosts — title+summary match (case-insensitive).
 * Keep short; false positives better than missing Nextcloud/nginx hits.
 */
export const STACK_KEYWORDS = [
  "nextcloud",
  "collabora",
  "coolify",
  "traefik",
  "docker",
  "containerd",
  "nginx",
  "openssl",
  "openssh",
  "ssh",
  "linux kernel",
  "kernel",
  "debian",
  "ubuntu",
  "alpine",
  "postgresql",
  "postgres",
  "mysql",
  "mariadb",
  "redis",
  "node.js",
  "nodejs",
  "next.js",
  "php",
  "ffmpeg",
  "curl",
  "libxml",
  "systemd",
  "sudo",
  "fail2ban",
  "vaultwarden",
  "gotenberg",
] as const;

export function matchStackKeywords(text: string): string[] {
  const hay = text.toLowerCase();
  const hits: string[] = [];
  for (const kw of STACK_KEYWORDS) {
    if (hay.includes(kw.toLowerCase())) hits.push(kw);
  }
  return hits;
}
