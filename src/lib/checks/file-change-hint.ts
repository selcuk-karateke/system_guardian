import type { SshClient } from "@/lib/ssh/types";

function shellQuote(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

/** Owner, mtime, recent SSH logins — best-effort, kein auditd nötig */
export async function getFileChangeHint(
  ssh: SshClient,
  filePath: string,
): Promise<string | null> {
  const q = shellQuote(filePath);
  const { stdout } = await ssh.exec(
    `
f=${q}
[ -f "$f" ] || exit 0
stat -c 'owner=%U modified=%y' "$f" 2>/dev/null || stat -f 'owner=%Su modified=%Sm' "$f" 2>/dev/null
echo '---ssh---'
journalctl -u ssh -S '3 hours ago' --no-pager 2>/dev/null | grep -E 'Accepted (publickey|password) for|session opened for' | tail -6
if [ -f /var/log/auth.log ]; then
  grep -E 'sshd.*Accepted|session opened' /var/log/auth.log 2>/dev/null | tail -6
fi
`.trim(),
  );

  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const statLine = lines.find((l) => l.startsWith("owner="));
  const loginLines = lines
    .filter((l) => !l.startsWith("owner=") && l !== "---ssh---")
    .map((l) => l.replace(/^.*sshd.*?:?\s*/, "").slice(0, 120))
    .filter((l, i, arr) => arr.indexOf(l) === i)
    .slice(0, 3);

  const parts: string[] = [];
  if (statLine) {
    const m = statLine.match(/^owner=(\S+)\s+modified=(.+)$/);
    if (m) parts.push(`Datei-Owner: ${m[1]}, geändert: ${m[2]}`);
    else parts.push(statLine.replace("owner=", "Owner ").replace("modified=", "geändert "));
  }
  if (loginLines.length) {
    parts.push(`Letzte SSH-Logins (Hinweis): ${loginLines.join(" · ")}`);
  } else {
    parts.push(
      "Kein SSH-Login in Logs (3h) — Änderung evtl. Konsole, Coolify oder Paket-Update",
    );
  }

  return parts.join(" — ");
}
