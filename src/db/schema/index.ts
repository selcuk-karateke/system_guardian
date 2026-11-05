import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const alertLevelEnum = pgEnum("alert_level", [
  "info",
  "warning",
  "critical",
]);
export const checkStatusEnum = pgEnum("check_status", [
  "healthy",
  "warning",
  "critical",
]);
export const globalStatusEnum = pgEnum("global_status", [
  "healthy",
  "warning",
  "critical",
]);

export const servers = pgTable("servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 128 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  ipv4: varchar("ipv4", { length: 45 }),
  ipv6: varchar("ipv6", { length: 45 }),
  /** host | container | full — welche Check-Module laufen */
  monitorProfile: varchar("monitor_profile", { length: 32 })
    .default("host")
    .notNull(),
  /** Per-server SSH (Slice 1). Secrets encrypted at rest. */
  sshUser: varchar("ssh_user", { length: 64 }),
  sshPort: integer("ssh_port"),
  sshPrivateKeyEnc: text("ssh_private_key_enc"),
  sshPasswordEnc: text("ssh_password_enc"),
  /** Per-server Coolify API (Slice 2). Token encrypted at rest. */
  coolifyApiUrl: varchar("coolify_api_url", { length: 512 }),
  coolifyApiTokenEnc: text("coolify_api_token_enc"),
  /** Per-server backup config (Slice 3). Null = ENV fallback until seeded. */
  backupPaths: text("backup_paths"),
  backupMonitoringDir: varchar("backup_monitoring_dir", { length: 512 }),
  backupTriggerCommand: text("backup_trigger_command"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const checkRuns = pgTable("check_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id")
    .references(() => servers.id)
    .notNull(),
  module: varchar("module", { length: 64 }).notNull(),
  status: checkStatusEnum("status").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const metricsSnapshots = pgTable("metrics_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id")
    .references(() => servers.id)
    .notNull(),
  cpuPercent: integer("cpu_percent"),
  ramPercent: integer("ram_percent"),
  swapPercent: integer("swap_percent"),
  loadAvg1: varchar("load_avg_1", { length: 16 }),
  loadAvg5: varchar("load_avg_5", { length: 16 }),
  loadAvg15: varchar("load_avg_15", { length: 16 }),
  cpuCores: integer("cpu_cores"),
  diskPercent: integer("disk_percent"),
  uptimeSeconds: integer("uptime_seconds"),
  temperatureCelsius: integer("temperature_celsius"),
  networkOk: boolean("network_ok"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id").references(() => servers.id),
  module: varchar("module", { length: 64 }).notNull(),
  level: alertLevelEnum("level").notNull(),
  message: text("message").notNull(),
  recommendation: text("recommendation"),
  resolvedAt: timestamp("resolved_at"),
  /** Letzte Check-Runde, in der die Ursache noch vorlag (Alert-Lifecycle). */
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  notificationSent: boolean("notification_sent").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const changeEvents = pgTable("change_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id")
    .references(() => servers.id)
    .notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  changeType: varchar("change_type", { length: 32 }).notNull(),
  entityKey: varchar("entity_key", { length: 255 }).notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const monitoredDomains = pgTable("monitored_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  checkHttp: boolean("check_http").default(true).notNull(),
  checkHttps: boolean("check_https").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const snapshots = pgTable("snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id")
    .references(() => servers.id)
    .notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const dailyReports = pgTable("daily_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
