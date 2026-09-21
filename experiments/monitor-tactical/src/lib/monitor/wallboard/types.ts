import type { CheckStatus } from "@/lib/checks/types";

export type WallboardStatus = CheckStatus;
export type WallboardLevel = "info" | "warning" | "critical";

export const WALLBOARD_DOMAINS = {
  server: {
    label: "SERVER",
    modules: [
      "server_health",
      "raid",
      "backups",
      "ssl",
      "website",
      "database",
    ],
  },
  network: {
    label: "NETWORK",
    modules: ["ports", "logs", "network", "scanner"],
  },
  docker: {
    label: "DOCKER",
    modules: ["docker", "coolify"],
  },
  security: {
    label: "SECURITY",
    modules: [
      "fim",
      "ssh_keys",
      "users",
      "logins",
      "cron",
      "security_posture",
      "services",
    ],
  },
} as const;

export type WallboardDomainId = keyof typeof WALLBOARD_DOMAINS;

export type WallboardDomain = {
  id: WallboardDomainId;
  label: string;
  score: number;
  status: WallboardStatus;
  hint: string;
};

export type WallboardEvent = {
  id: string;
  time: string;
  level: WallboardLevel;
  text: string;
  title: string;
  detail: string;
};

export type WallboardNetworkNode = {
  id: string;
  label: string;
  active: boolean;
  angle: number;
};

export type WallboardDockerNode = {
  name: string;
  state: "running" | "stopped" | "other";
  indent: number;
};

export type WallboardDockerGroupId = "coolify" | "apps" | "dbs" | "services";

export type WallboardDockerGroup = {
  id: WallboardDockerGroupId;
  label: string;
  count: number;
  status: CheckStatus;
  hint: string;
};

export type WallboardDockerSummary = {
  running: number;
  crashed: number;
  restartLoops: number;
  tree: WallboardDockerNode[];
  groups: WallboardDockerGroup[];
};

export type WallboardSecurityBlock = {
  label: string;
  value: string;
  status: CheckStatus;
};

export type WallboardNetworkOutage = {
  module: string;
  label: string;
  status: CheckStatus;
};

export type WallboardNetworkTactical = {
  domainStatus: CheckStatus;
  activeLinks: number;
  totalNodes: number;
  scannerStatus: CheckStatus;
  scannerDetail: string;
  outages: WallboardNetworkOutage[];
  nodes: WallboardNetworkNode[];
};

export type WallboardData = {
  globalStatus: WallboardStatus;
  healthScore: number;
  counts: { healthy: number; warning: number; critical: number };
  domains: WallboardDomain[];
  serverHints: string[];
  events: WallboardEvent[];
  network: WallboardNetworkTactical;
  docker: WallboardDockerSummary;
  security: {
    threatLevel: "LOW" | "MEDIUM" | "HIGH";
    blocks: WallboardSecurityBlock[];
    warningCount: number;
  };
};
