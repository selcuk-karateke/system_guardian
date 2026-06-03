export type CheckStatus = "healthy" | "warning" | "critical";
export type AlertLevel = "info" | "warning" | "critical";

export interface AlertInput {
  level: AlertLevel;
  message: string;
  recommendation?: string;
}

export interface CheckResult {
  module: string;
  status: CheckStatus;
  data: Record<string, unknown>;
  alerts: AlertInput[];
  recommendations?: string[];
}

export type CheckRunner = (serverId: string) => Promise<CheckResult>;
