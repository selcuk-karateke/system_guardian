import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Boxes,
  Clock,
  Cpu,
  Database,
  Eye,
  FileKey2,
  FileSearch,
  FileText,
  Globe,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  MemoryStick,
  Network,
  Radar,
  ScrollText,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Users,
  Workflow,
} from "lucide-react";
import type { MetricOrderKey } from "@/lib/monitor/metric-order";

export const METRIC_ICONS: Record<MetricOrderKey, LucideIcon> = {
  load: Cpu,
  ram: MemoryStick,
  disk: HardDrive,
  uptime: Timer,
};

export const MODULE_ICONS: Record<string, LucideIcon> = {
  server_health: Server,
  raid: HardDrive,
  docker: Boxes,
  coolify: Workflow,
  database: Database,
  ssl: ShieldCheck,
  website: Globe,
  ports: Network,
  backups: HardDrive,
  logs: ScrollText,
  fim: FileSearch,
  ssh_keys: KeyRound,
  users: Users,
  logins: FileKey2,
  web_presence: Eye,
  cron: Clock,
  processes: Activity,
  network: Network,
  scanner: Radar,
  services: LayoutDashboard,
  security_posture: Shield,
  trivy: ShieldAlert,
  reserved: FileText,
  reserved_b: FileText,
};

export function moduleIcon(id: string): LucideIcon {
  return MODULE_ICONS[id] ?? FileText;
}
