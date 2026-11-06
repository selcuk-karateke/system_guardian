/** Live payload pushed by the host metrics agent. */

export type AgentTalkerState = "established" | "other";

export type AgentTalkerKind =
  | "ssh"
  | "https"
  | "http"
  | "rsync"
  | "ftp"
  | "smtp"
  | "db"
  | "smb"
  | "nfs"
  | "git"
  | "dns"
  | "other";

export type AgentTalker = {
  pid: number | null;
  process: string;
  remoteIp: string;
  remotePort: number | null;
  state: AgentTalkerState;
  /** Bytes/sec TX estimate since last sample (0 if unknown). */
  txBps: number;
  rxBps: number;
  /** Bytes written (process /proc/io) in this sample window. */
  txBytes?: number | null;
  rxBytes?: number | null;
  /** Still present across consecutive samples. */
  stillActive: boolean;
  /** Port/process classification — answers “what kind of data path?” */
  kind?: AgentTalkerKind | null;
  /** Sanitized argv — often shows paths (rsync/pg_dump/curl). */
  cmdline?: string | null;
  /** Regular files open by the process (likely being read for upload). */
  openFiles?: string[];
};

export type AgentEgressLive = {
  txMbps: number;
  rxMbps: number;
  iface: string | null;
  windowSec: number;
};

export type AgentIngestPayload = {
  agentVersion: string;
  hostname: string;
  collectedAt?: number;
  cpuPercent: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  memUsedBytes: number | null;
  memTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskTotalBytes: number | null;
  uptimeSec: number | null;
  egress: AgentEgressLive | null;
  talkers: AgentTalker[];
};

export type AgentLiveSnapshot = AgentIngestPayload & {
  receivedAt: number;
  serverId: string;
};

export const AGENT_LIVE_CATEGORY = "agent_live";
export const AGENT_FRESH_MS = 30_000;
