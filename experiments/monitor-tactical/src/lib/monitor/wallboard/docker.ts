import { worstStatus } from "@/lib/config";
import type { CheckStatus } from "@/lib/checks/types";
import { WALLBOARD_DOMAINS } from "./types";
import type {
  WallboardDockerGroup,
  WallboardDockerGroupId,
  WallboardDockerNode,
  WallboardDockerSummary,
} from "./types";

const PROXY_PATTERN = /traefik|caddy|nginx-proxy|proxy/i;

function isProxyName(name: string): boolean {
  return PROXY_PATTERN.test(name);
}

function shortContainerLabel(name: string): string {
  const n = name.replace(/^\//, "");
  if (/^[a-z0-9]{12,}-\d{10,}$/i.test(n)) return `${n.slice(0, 10)}…`;
  if (n.length > 26) return `${n.slice(0, 25)}…`;
  return n;
}

function groupStatus(
  names: string[],
  containers: { Names?: string; State?: string }[],
  domainBad: boolean,
): CheckStatus {
  if (names.length === 0) return "healthy";
  let hasStopped = false;
  for (const n of names) {
    const c = containers.find(
      (x) => x.Names === n || x.Names?.includes(n),
    );
    if (c?.State && c.State !== "running" && c.State !== "created") {
      hasStopped = true;
    }
  }
  if (domainBad && hasStopped) return "critical";
  if (hasStopped) return "warning";
  return "healthy";
}

function buildDockerGroups(
  checkData: Record<string, Record<string, unknown>>,
  dockerDomainStatus: CheckStatus,
): WallboardDockerGroup[] {
  const d = checkData.docker;
  const containers =
    (d?.containers as { Names?: string; State?: string }[]) ?? [];
  const inv = d?.inventory as
    | { byCategory?: Record<string, string[]> }
    | undefined;
  const byCat = inv?.byCategory ?? {};
  const coolify = byCat.coolify ?? [];
  const coolifyNames = coolify.filter((n) => !isProxyName(n));
  const proxyNames = coolify.filter(isProxyName);
  const serviceNames = [
    ...(byCat.monitoring ?? []),
    ...proxyNames,
    ...(byCat.other ?? []).slice(0, 8),
  ];
  const appNames = [...(byCat.app ?? []), ...(byCat.wordpress ?? [])];
  const dbNames = byCat.database ?? [];

  const domainBad =
    dockerDomainStatus === "warning" || dockerDomainStatus === "critical";

  const defs: {
    id: WallboardDockerGroupId;
    label: string;
    names: string[];
  }[] = [
    { id: "coolify", label: "COOLIFY", names: coolifyNames },
    { id: "apps", label: "APPS", names: appNames },
    { id: "dbs", label: "DBS", names: dbNames },
    { id: "services", label: "SERVICES", names: serviceNames },
  ];

  return defs.map(({ id, label, names }) => {
    const status = groupStatus(names, containers, domainBad);
    const running = names.filter((n) => {
      const c = containers.find(
        (x) => x.Names === n || x.Names?.includes(n),
      );
      return c?.State === "running";
    }).length;
    const hint =
      names.length === 0
        ? "—"
        : status === "healthy"
          ? `${running}/${names.length} up`
          : `${running}/${names.length} up · check`;
    return { id, label, count: names.length, status, hint };
  });
}

export function buildDockerSummary(
  checkData: Record<string, Record<string, unknown>>,
  statusMap: Record<string, string>,
): WallboardDockerSummary {
  const d = checkData.docker;
  const running = (d?.running as number) ?? 0;
  const containers =
    (d?.containers as { Names?: string; State?: string; Image?: string }[]) ??
    [];
  const crashed = containers.filter(
    (c) => c.State && c.State !== "running" && c.State !== "created",
  ).length;
  const restartLoops =
    (d?.stoppedUnexpected as string[] | undefined)?.length ?? 0;

  const inv = d?.inventory as
    | { byCategory?: Record<string, string[]> }
    | undefined;
  const byCat = inv?.byCategory ?? {};

  const stateOf = (name: string): WallboardDockerNode["state"] => {
    const c = containers.find(
      (x) => x.Names === name || x.Names?.includes(name),
    );
    if (!c?.State) return "other";
    if (c.State === "running") return "running";
    if (c.State === "created") return "other";
    return "stopped";
  };

  const coolifyStack = byCat.coolify ?? [];
  const tree: WallboardDockerNode[] = [
    { name: "Docker", state: "running", indent: 0 },
    {
      name:
        coolifyStack.length > 0
          ? `Coolify (${coolifyStack.length})`
          : "Coolify",
      state: coolifyStack.some((n) => stateOf(n) === "running")
        ? "running"
        : "other",
      indent: 1,
    },
  ];

  const groups: { key: string; title: string }[] = [
    { key: "database", title: "Databases" },
    { key: "app", title: "Apps" },
    { key: "wordpress", title: "WordPress" },
    { key: "monitoring", title: "Monitoring" },
  ];

  for (const g of groups) {
    const names = byCat[g.key] ?? [];
    if (names.length === 0) continue;
    const show = names.slice(0, 4);
    for (const n of show) {
      tree.push({
        name: shortContainerLabel(n),
        state: stateOf(n),
        indent: 2,
      });
    }
    if (names.length > show.length) {
      tree.push({
        name: `+${names.length - show.length} ${g.title}`,
        state: "running",
        indent: 2,
      });
    }
  }

  const other = byCat.other ?? [];
  if (other.length > 0 && tree.length < 9) {
    tree.push({
      name: `Other (${other.length})`,
      state: other.some((n) => stateOf(n) === "running") ? "running" : "stopped",
      indent: 2,
    });
  }

  if (tree.length <= 2 && containers.length > 0) {
    for (const c of containers
      .filter((x) => x.State === "running")
      .slice(0, 6)) {
      tree.push({
        name: shortContainerLabel(c.Names ?? c.Image ?? "?"),
        state: "running",
        indent: 2,
      });
    }
  }

  const dockerDomain = worstStatus(
    WALLBOARD_DOMAINS.docker.modules.map(
      (m) => (statusMap[m] ?? "unknown") as CheckStatus,
    ),
  );

  return {
    running: running || containers.filter((c) => c.State === "running").length,
    crashed,
    restartLoops,
    tree: tree.slice(0, 8),
    groups: buildDockerGroups(checkData, dockerDomain),
  };
}
