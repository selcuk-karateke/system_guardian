/**
 * Handlungsempfehlungen für Schutz-Alerts.
 * Guardian warnt/blockt/triggert — Restore nur als Checkliste, nie automatisch.
 */

export function restoreChecklistShort(): string {
  return [
    "Restore nur manuell auf dem Host (Dry-Run zuerst)",
    "Quellpfad unter BACKUP_PATHS prüfen",
    "Ziel nur in freigegebenem Restore-Root",
    "Guardian spielt nichts zurück",
  ].join("; ");
}

export function backupMissingRecommendation(paths: string[]): string {
  return [
    `BACKUP_PATHS prüfen (${paths.join(", ")}) und Backup-Job starten`,
    "Settings → Schutz: Backup jetzt anstoßen (wenn BACKUP_TRIGGER_COMMAND gesetzt)",
    restoreChecklistShort(),
  ].join(" — ");
}

export function backupEmptyRecommendation(path: string): string {
  return [
    `Backup-Job für ${path} prüfen (0 Byte = fehlgeschlagen/leer)`,
    "Job neu anstoßen; danach Größe/Alter im nächsten Check",
    restoreChecklistShort(),
  ].join(" — ");
}

export function backupStaleRecommendation(path: string, maxAgeDays: number): string {
  return [
    `Backup älter als ${maxAgeDays}d (${path}): Job/Cron prüfen und neu starten`,
    "Settings → Schutz: Backup triggern falls konfiguriert",
    restoreChecklistShort(),
  ].join(" — ");
}

export function backupSmallRecommendation(): string {
  return [
    "Backup-Job-Log prüfen — Lauf unvollständig?",
    "Settings → Schutz: Job anstoßen und Größe erneut prüfen",
  ].join(" — ");
}

export function blockedIpRecommendation(
  ip: string,
  opts: { autoBlockEnabled: boolean; autoBlocked?: boolean },
): string {
  if (opts.autoBlocked) {
    return `IOC-IP ${ip}: Auto-Block via fail2ban ausgeführt — Prozess/Container prüfen, Auth-Logs, FIM; Restore nur bei bestätigtem Kompromiss (${restoreChecklistShort()})`;
  }
  if (opts.autoBlockEnabled) {
    return `IOC-IP ${ip}: fail2ban banip vorbereiten/ausführen, Prozess stoppen, docker inspect; ufw deny from ${ip}; ${restoreChecklistShort()}`;
  }
  return [
    `Sofort: fail2ban-client set sshd banip ${ip} (oder ufw deny from ${ip})`,
    "Prozess/Container der Verbindung stoppen",
    "AUTO_BLOCK_ENABLED=true nur für BLOCKED_REMOTE_IPS (Opt-in)",
    restoreChecklistShort(),
  ].join(" — ");
}

export function iocAlertRecommendation(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("shell")) {
    return [
      "Zuerst prüfen: ist das euer eigener Prozess (z.B. Hermes/Coolify-Start)?",
      "Wenn ja: Entschärfen und ggf. in TRUSTED_SHELL_PROCESS_PATTERNS aufnehmen",
      "Wenn nein / unbekannt: Prozess-UID/Pfad prüfen, Container stoppen, auth.log + FIM ansehen",
    ].join(" — ");
  }
  if (lower.includes("ioc") || lower.includes("malware") || lower.includes("block")) {
    return [
      `${label}: IOC in Logs/ss bestätigen`,
      "nur bei bestätigtem Treffer: betroffene Container/Dienste stoppen, IP blocken",
      restoreChecklistShort(),
    ].join(" — ");
  }
  return [
    `${label}: Details prüfen (eigenes System vs. fremd)`,
    "Nur bei bestätigtem Angriff: Dienste stoppen / blocken",
    "Unklar → Security-Seite und Prozessliste ansehen, nicht blind stoppen",
  ].join(" — ");
}

export function suspiciousOutboundRecommendation(hasContainer: boolean): string {
  if (hasContainer) {
    return [
      "Prozess gehört zu Container (cgroup) — docker inspect / Logs",
      "kein pkill -u Host-User",
      "bei IOC-IP: blocken (fail2ban/ufw)",
      restoreChecklistShort(),
    ].join(" — ");
  }
  return [
    "ss -tunap + docker ps",
    "bei bekannter IOC-IP: fail2ban/ufw block",
    "Prozess stoppen, Image-Digest prüfen",
    restoreChecklistShort(),
  ].join(" — ");
}
