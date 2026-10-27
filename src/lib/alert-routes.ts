const MODULE_PAGE: Record<string, string> = {
  server_health: "/infrastructure",
  raid: "/infrastructure",
  backups: "/infrastructure",
  logs: "/infrastructure",
  ssl: "/infrastructure",
  website: "/infrastructure",
  docker: "/docker",
  coolify: "/docker",
  trivy: "/docker",
  database: "/databases",
};

const PAGE_LABELS: Record<string, string> = {
  "/infrastructure": "Infrastruktur",
  "/docker": "Docker",
  "/databases": "Datenbanken",
  "/security": "Sicherheit",
};

export function getModulePageForAlert(module: string): {
  href: string;
  label: string;
} {
  const href = MODULE_PAGE[module] ?? "/security";
  return { href, label: PAGE_LABELS[href] ?? "Sicherheit" };
}
