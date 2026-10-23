import type { SshClient } from "@/lib/ssh/types";

export type ContainerProcessInfo = {
  pid: number;
  containerId: string | null;
  containerName: string | null;
  image: string | null;
};

const LOOKUP_MARKER = "SG_PID_CONTAINER_LOOKUP";

/** PID aus `ss` users:(("name",pid=N,fd=…)) */
export function parsePidFromSsProcess(process: string): number | null {
  const m = process.match(/\bpid=(\d+)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Container-ID aus /proc/…/cgroup (docker / containerd). */
export function parseContainerIdFromCgroup(cgroup: string): string | null {
  const docker = cgroup.match(/docker[-\/]([0-9a-f]{12,64})/i);
  if (docker) return docker[1].toLowerCase();
  const cri = cgroup.match(/cri-containerd-([0-9a-f]{12,64})/i);
  if (cri) return cri[1].toLowerCase();
  const bare = cgroup.match(/\/([0-9a-f]{64})(?:\.scope)?(?:\/|$)/i);
  if (bare) return bare[1].toLowerCase();
  return null;
}

export function shortImageRef(image: string): string {
  const noDigest = image.split("@")[0] ?? image;
  if (noDigest.length <= 48) return noDigest;
  return `${noDigest.slice(0, 45)}…`;
}

export function formatContainerContextSuffix(
  info: Pick<ContainerProcessInfo, "containerId" | "containerName" | "image">,
): string {
  const name = info.containerName?.replace(/^\//, "").trim() || null;
  const idShort = info.containerId?.slice(0, 12) || null;
  if (!name && !idShort) return "";
  const label = name ?? idShort!;
  const img = info.image ? ` · ${shortImageRef(info.image)}` : "";
  const idPart = name && idShort ? ` #${idShort}` : "";
  return ` [container ${label}${img}${idPart}]`;
}

export function enrichReasonWithContainer(
  reason: string,
  info: ContainerProcessInfo | null | undefined,
): string {
  if (!info?.containerId && !info?.containerName) return reason;
  if (reason.includes("[container ")) return reason;
  return `${reason}${formatContainerContextSuffix(info)}`;
}

/**
 * Ein SSH-Batch für mehrere PIDs.
 * Ausgabezeilen: `pid\\tcontainerId\\tname\\timage`
 */
export function buildPidContainerLookupScript(pids: number[]): string {
  const unique = [...new Set(pids.filter((p) => Number.isFinite(p) && p > 0))].slice(
    0,
    40,
  );
  if (unique.length === 0) {
    return `echo ${LOOKUP_MARKER}`;
  }
  const list = unique.join(" ");
  // Go-Template tabs: {{"\t"}} — in TS als \\t escapen
  const inspectFmt =
    `{{.Id}}{{"\\t"}}{{.Name}}{{"\\t"}}{{.Config.Image}}`;
  return [
    `echo ${LOOKUP_MARKER}`,
    `for pid in ${list}; do`,
    `  cg=$(cat /proc/$pid/cgroup 2>/dev/null || true)`,
    `  cid=$(printf '%s\\n' "$cg" | grep -oE 'docker[-/][0-9a-f]{12,}' | head -1 | sed 's/.*[-/]//')`,
    `  if [ -z "$cid" ]; then cid=$(printf '%s\\n' "$cg" | grep -oE 'cri-containerd-[0-9a-f]{12,}' | head -1 | sed 's/cri-containerd-//'); fi`,
    `  if [ -z "$cid" ]; then cid=$(printf '%s\\n' "$cg" | grep -oE '[0-9a-f]{64}' | head -1); fi`,
    `  if [ -n "$cid" ]; then`,
    `    info=$(docker inspect -f '${inspectFmt}' "$cid" 2>/dev/null | head -1)`,
    `    if [ -n "$info" ]; then printf '%s\\t%s\\n' "$pid" "$info"; else printf '%s\\t\\t\\t\\n' "$pid"; fi`,
    `  else`,
    `    printf '%s\\t\\t\\t\\n' "$pid"`,
    `  fi`,
    `done`,
  ].join("\n");
}

export function parsePidContainerLookupOutput(
  stdout: string,
): Map<number, ContainerProcessInfo> {
  const map = new Map<number, ContainerProcessInfo>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === LOOKUP_MARKER) continue;
    const parts = trimmed.split("\t");
    if (parts.length < 1) continue;
    const pid = Number(parts[0]);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    const containerId = parts[1]?.trim() || null;
    const containerName = parts[2]?.trim()?.replace(/^\//, "") || null;
    const image = parts[3]?.trim() || null;
    map.set(pid, {
      pid,
      containerId: containerId || null,
      containerName: containerName || null,
      image: image || null,
    });
  }
  return map;
}

export async function resolveContainersByPids(
  ssh: SshClient,
  pids: number[],
): Promise<Map<number, ContainerProcessInfo>> {
  const unique = [...new Set(pids.filter((p) => p > 0))];
  if (unique.length === 0) return new Map();
  const script = buildPidContainerLookupScript(unique);
  const { stdout } = await ssh.exec(script);
  return parsePidContainerLookupOutput(stdout);
}
