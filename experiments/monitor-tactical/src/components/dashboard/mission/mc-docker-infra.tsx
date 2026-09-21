import type { WallboardDockerGroup, WallboardDockerSummary } from "@/lib/monitor-wallboard";

const CHAIN_ORDER: WallboardDockerGroup["id"][] = [
  "coolify",
  "apps",
  "dbs",
  "services",
];

export function McDockerInfra({
  docker,
  tone,
}: {
  docker: WallboardDockerSummary;
  tone: "ok" | "warn" | "crit";
}) {
  const byId = Object.fromEntries(docker.groups.map((g) => [g.id, g]));
  const chain = CHAIN_ORDER.map((id) => byId[id]).filter(Boolean);
  const down = docker.crashed > 0;

  return (
    <div
      className={`mc-topo mc-topo--${tone}${down ? " mc-topo--down" : ""}`}
      aria-label="Docker topology"
    >
      <div className="mc-topo-health" aria-hidden>
        <span
          className="mc-topo-health-bar"
          style={{
            width: `${Math.min(100, (docker.running / Math.max(docker.running + docker.crashed, 1)) * 100)}%`,
          }}
        />
      </div>
      <svg className="mc-topo-svg" viewBox="0 0 900 120" preserveAspectRatio="none" aria-hidden>
        <line x1="80" y1="60" x2="820" y2="60" className="mc-topo-spine" />
      </svg>
      <div className="mc-topo-nodes">
        {chain.map((g, i) => (
          <div
            key={g.id}
            className={`mc-topo-node mc-topo-node--${g.status}`}
            style={{ flex: i === 0 || i === chain.length - 1 ? 1.1 : 1 }}
            title={`${g.label}: ${g.count}`}
          >
            <span className="mc-topo-node-ring" />
            <span className="mc-topo-node-count">{g.count}</span>
            <span className="mc-topo-node-name">{g.label}</span>
          </div>
        ))}
      </div>
      <div className="mc-topo-pulse" aria-hidden>
        <span className="mc-topo-run" data-n={docker.running} />
        {docker.crashed > 0 && <span className="mc-topo-fail" />}
      </div>
    </div>
  );
}
