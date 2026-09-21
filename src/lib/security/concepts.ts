/**
 * UI copy: maps SIEM terms to System Guardian modules (see docs/SECURITY-FEATURES.md).
 */
export const SECURITY_CONCEPTS = [
  {
    id: "log-analysis",
    title: "Log-Analyse",
    siem: "Zentrale Log-Sammlung & Mustererkennung",
    guardian: "Module logs + logins",
    why: "Live-SSH statt Elasticsearch – reicht für Coolify-Host, weniger Betrieb.",
    status: "active" as const,
    cron: "server (15m) + security (60m)",
  },
  {
    id: "hids",
    title: "Intrusion Detection (HIDS)",
    siem: "Agent-basierte Angriffserkennung",
    guardian: "logins, processes, scanner, ports, network, users",
    why: "Kein Kernel-Agent – mehrere leichte Checks per SSH bilden einen schlanken HIDS.",
    status: "active" as const,
    cron: "security (60m)",
  },
  {
    id: "fim",
    title: "File Integrity Monitoring",
    siem: "Tausende Dateien, Inotify, Compliance",
    guardian: "fim + ssh_keys + users + cron",
    why: "Nur kritische Pfade (FIM_PATHS); Baseline beim 1. Scan ohne Alert-Spam.",
    status: "active" as const,
    cron: "security (60m)",
  },
  {
    id: "cve",
    title: "Vulnerability Detection",
    siem: "CVE-Datenbank, Patch-Reports",
    guardian: "Noch nicht implementiert",
    why: "Phase 2: apt/trivy – eigenes Thema, sonst zu viele Fehlalarme in v1.",
    status: "planned" as const,
    cron: "—",
  },
  {
    id: "cloud",
    title: "Cloud Security",
    siem: "AWS / Azure / GCP APIs",
    guardian: "SSH-Host only",
    why: "Ihr monitored den VM/Coolify-Server; Cloud-APIs = Phase 3 (Hetzner/Coolify).",
    status: "planned" as const,
    cron: "—",
  },
  {
    id: "dashboard",
    title: "Dashboard",
    siem: "Kibana / OpenSearch",
    guardian: "Next.js UI + PostgreSQL",
    why: "Eine App für Status & Alerts – kein zweites Log-Stack.",
    status: "active" as const,
    cron: "—",
  },
] as const;
