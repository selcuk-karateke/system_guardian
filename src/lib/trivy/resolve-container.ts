import type { SshClient } from "@/lib/ssh/types";

/**
 * Coolify app containers are named `{coolify.name}-{numeric}`.
 * Force-rebuild (Dockerfile) replaces the numeric suffix → stale names break Scan.
 */
export function coolifyUuidFromContainerName(name: string): string | null {
  const base = name.split(",")[0]?.trim().replace(/^\//, "") ?? name;
  const m = base.match(/^([a-z0-9]{10,40})-\d+$/i);
  return m?.[1] ?? null;
}

export type ResolvedContainerCandidate = {
  name: string;
  state: string;
};

/** Prefer running; otherwise first match (newest docker ps order). */
export function pickResolvedContainer(
  candidates: ResolvedContainerCandidate[],
): string | null {
  if (candidates.length === 0) return null;
  const running = candidates.find((c) => /running/i.test(c.state));
  return (running ?? candidates[0]).name;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Resolve a live Docker container name for Trivy / inspect.
 * Exact name first; if missing or not running, find by Coolify UUID label/name.
 */
export async function resolveLiveContainerName(
  ssh: SshClient,
  containerName: string,
  coolifyUuid?: string | null,
): Promise<{ name: string; remapped: boolean } | { name: null; message: string }> {
  const uuid =
    (coolifyUuid ?? "").trim() ||
    coolifyUuidFromContainerName(containerName) ||
    null;

  const exact = await ssh.exec(
    `docker inspect --format '{{.Name}} {{.State.Status}}' ${shellQuote(containerName)} 2>/dev/null`,
    15_000,
  );
  if (exact.code === 0 && exact.stdout.trim()) {
    const parts = exact.stdout.trim().split(/\s+/);
    const status = parts[parts.length - 1] ?? "";
    if (/running/i.test(status)) {
      return { name: containerName, remapped: false };
    }
  }

  if (!uuid) {
    if (exact.code === 0 && exact.stdout.trim()) {
      // Exited container still inspectable — last resort without UUID.
      return { name: containerName, remapped: false };
    }
    return {
      name: null,
      message: `Container ${containerName} nicht gefunden`,
    };
  }

  const byLabel = await ssh.exec(
    `docker ps -a --filter ${shellQuote(`label=coolify.name=${uuid}`)} --format '{{.Names}}\\t{{.State}}' 2>/dev/null`,
    15_000,
  );
  let candidates = parseNameStateLines(byLabel.stdout);

  if (candidates.length === 0) {
    const byName = await ssh.exec(
      `docker ps -a --filter ${shellQuote(`name=${uuid}`)} --format '{{.Names}}\\t{{.State}}' 2>/dev/null`,
      15_000,
    );
    candidates = parseNameStateLines(byName.stdout).filter((c) => {
      const n = c.name.replace(/^\//, "");
      return (
        n === uuid ||
        n.startsWith(`${uuid}-`) ||
        coolifyUuidFromContainerName(n) === uuid
      );
    });
  }

  const picked = pickResolvedContainer(candidates);
  if (!picked) {
    return {
      name: null,
      message: `Container für Coolify-UUID ${uuid} nicht gefunden (nach Rebuild oft neuer Name — Inventar aktualisieren)`,
    };
  }

  return {
    name: picked,
    remapped: picked !== containerName,
  };
}

function parseNameStateLines(stdout: string): ResolvedContainerCandidate[] {
  const out: ResolvedContainerCandidate[] = [];
  for (const line of stdout.split("\n")) {
    const [name, state] = line.split("\t");
    if (!name?.trim()) continue;
    out.push({
      name: name.trim().replace(/^\//, ""),
      state: (state ?? "").trim(),
    });
  }
  return out;
}
