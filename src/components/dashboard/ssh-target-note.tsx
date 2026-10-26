import { sshTargetMismatch } from "@/lib/server-scope";

/** Warn when inventory host ≠ global SSH_HOST (CHECK_MODE=ssh). */
export function SshTargetNote({
  host,
  ipv4,
}: {
  host: string;
  ipv4: string | null;
}) {
  const { mismatch, sshHost, checkMode } = sshTargetMismatch({ host, ipv4 });
  if (!mismatch || !sshHost) return null;

  return (
    <p className="text-xs text-amber-300/90 rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2">
      Inventar zeigt <code className="text-amber-100">{ipv4 ?? host}</code>, Checks
      laufen aber per SSH gegen{" "}
      <code className="text-amber-100">{sshHost}</code> ({checkMode}). Host/IPv4
      unter Einstellungen anpassen — oder später Multi-Host-SSH.
    </p>
  );
}
