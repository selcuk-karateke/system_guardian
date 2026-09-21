import type { WallboardNetworkTactical } from "@/lib/monitor-wallboard";

/** Fixed layout — no overlap; labels from wallboard data */
const NODE_POS: Record<string, { x: number; y: number }> = {
  cf: { x: 500, y: 95 },
  gh: { x: 720, y: 175 },
  hz: { x: 860, y: 350 },
  ai: { x: 720, y: 525 },
  client: { x: 500, y: 600 },
  coolify: { x: 280, y: 525 },
};

const HUB = { x: 500, y: 350 };

function nodeLabel(name: string): string[] {
  if (name.length <= 10) return [name];
  const parts = name.split(/\s+/);
  if (parts.length >= 2 && parts[0].length <= 12) {
    return [parts[0], parts.slice(1).join(" ").slice(0, 12)];
  }
  return [name.slice(0, 12)];
}

export function McNetworkTactical({
  hostIp,
  network,
}: {
  hostIp: string;
  network: WallboardNetworkTactical;
}) {
  const hostShort = hostIp.split(".").slice(-1).join(".");

  return (
    <div
      className={`mc-netmap mc-netmap--${network.domainStatus}${network.outages.length > 0 ? " mc-netmap--outage" : ""}`}
      aria-label="Network topology"
    >
      <svg
        className="mc-netmap-svg"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {network.nodes.map((n) => {
          const pos = NODE_POS[n.id];
          if (!pos) return null;
          return (
            <line
              key={`${n.id}-line`}
              x1={HUB.x}
              y1={HUB.y}
              x2={pos.x}
              y2={pos.y}
              className={
                n.active ? "mc-netmap-link mc-netmap-link--active" : "mc-netmap-link"
              }
            />
          );
        })}
        <circle cx={HUB.x} cy={HUB.y} r="58" className="mc-netmap-hub" />
        <text x={HUB.x} y={HUB.y - 6} className="mc-netmap-hub-ip">
          {hostShort}
        </text>
        <text x={HUB.x} y={HUB.y + 22} className="mc-netmap-hub-sub">
          HOST
        </text>
        {network.nodes.map((n) => {
          const pos = NODE_POS[n.id];
          if (!pos) return null;
          const lines = nodeLabel(n.label);
          return (
            <g
              key={`${n.id}-node`}
              className={`mc-netmap-node${n.active ? " mc-netmap-node--on" : ""}`}
            >
              <circle cx={pos.x} cy={pos.y} r="40" className="mc-netmap-node-ring" />
              {lines.map((line, i) => (
                <text
                  key={line}
                  x={pos.x}
                  y={pos.y + (lines.length === 1 ? 6 : -4 + i * 16)}
                  className="mc-netmap-node-label"
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
