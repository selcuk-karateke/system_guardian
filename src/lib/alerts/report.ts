import { parseFailedUnitName } from "@/lib/checks/services";
import { APP_TIMEZONE, formatAppDateTime } from "@/lib/datetime";
import { getCheckMode } from "@/lib/config";
import { MODULE_LABELS } from "@/lib/module-labels";
import { formatModuleDetailLines } from "@/lib/monitor-details";

export type AlertReportInput = {
  id: string;
  level: string;
  module: string;
  message: string;
  recommendation?: string | null;
  createdAt: Date;
  resolvedAt?: Date | null;
  notificationSent?: boolean;
};

export type AlertCheckContext = {
  status: string;
  createdAt: Date;
  data: Record<string, unknown>;
};

export type AlertReportContext = {
  hostLabel?: string;
  hostIp?: string;
  checkMode?: string;
  appUrl?: string;
  check?: AlertCheckContext | null;
};

const LEVEL_DE: Record<string, string> = {
  critical: "KRITISCH",
  warning: "WARNUNG",
  info: "INFO",
};

const formatDeDate = formatAppDateTime;

function levelLabel(level: string): string {
  return LEVEL_DE[level] ?? level.toUpperCase();
}

function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

/** Kurze Einordnung für häufig missverständliche Meldungen. */
function buildAlertExplanation(alert: AlertReportInput): string | null {
  if (
    alert.module === "services" &&
    /chkrootkit/i.test(alert.message)
  ) {
    return [
      "chkrootkit.service schlägt täglich fehl, weil der Scan fertig wird,",
      "aber `mail` zum Versenden des Reports fehlt (status 127).",
      "Kein Einbruch — Konfigurations-/Mail-Problem auf Minimal-Images.",
      "",
      "Optional auf dem Server:",
      "  apt install bsd-mailx   # oder nullmailer",
      "  systemctl reset-failed chkrootkit.service",
      "",
      "Oder in .env: EXPECTED_FAILED_UNITS=chkrootkit.service (Standard).",
      "Scan-Ergebnis: cat /var/log/chkrootkit/log",
    ].join("\n");
  }

  if (
    alert.module === "services" &&
    (/chkrootkit/i.test(alert.message) ||
      /failed|●/.test(alert.message))
  ) {
    if (/chkrootkit/i.test(alert.message) || /●/.test(alert.message)) {
      return [
        "Betroffen: chkrootkit.service (täglicher Rootkit-Scan).",
        "",
        "Ursache: Scan läuft durch, aber `mail` fehlt → Exit 127 → systemd „failed“.",
        "Kein Einbruch, kein Problem mit Docker/fail2ban/SSH (die waren aktiv).",
        "",
        "Optional: apt install bsd-mailx  oder  systemctl reset-failed chkrootkit.service",
        "Guardian ignoriert chkrootkit jetzt (EXPECTED_FAILED_UNITS).",
        "Diesen alten Alert entschärfen — nach neuem Check keine Meldung mehr.",
      ].join("\n");
    }
    const units =
      alert.message.match(
        /failed:\s*([^.]+)|systemd failed:\s*([^\n]+)/i,
      )?.[1] ??
      alert.message.match(/„failed“:\s*(.+)$/)?.[1];
    const firstUnit = units?.split(/,\s*/)[0]?.trim();
    return [
      "Mindestens eine systemd-Unit ist im Zustand „failed“ (abgestürzt oder",
      "Start fehlgeschlagen). Das ist unabhängig von Docker/fail2ban/SSH.",
      "",
      ...(firstUnit && firstUnit !== "●"
        ? [
            `Betroffene Unit(s): ${units ?? firstUnit}`,
            "",
            "Diagnose auf dem Server:",
            `  systemctl status ${firstUnit}`,
            `  journalctl -u ${firstUnit} -n 50 --no-pager`,
            "",
            "Häufig harmlos: einmaliger Update-Dienst. Trotzdem Logs prüfen.",
          ]
        : [
            "Diagnose: systemctl --failed",
            "Der Unit-Name fehlte in der alten Meldung (Parsing-Bug) —",
            "Security-Check erneut auslösen für korrekten Namen.",
          ]),
    ].join("\n");
  }

  if (
    alert.module === "services" &&
    alert.message.includes("Expected service inactive")
  ) {
    return [
      "Diese Meldung ist sehr wahrscheinlich ein Fehlalarm.",
      "",
      "Der alte Check hat alle inaktiven Dienste mit „ssh“ im Namen gemeldet —",
      "darunter sshd-keygen.service. Das ist ein einmaliger Hilfsdienst zum",
      "Erzeugen von SSH-Hostkeys; „inactive/dead“ ist dort normal.",
      "",
      "Pflichtdienste sind jetzt nur noch: Docker, fail2ban, SSH (ssh.service).",
      "Alert entschärfen und Security-Check erneut auslösen — dann sollte",
      "keine neue Meldung für sshd-keygen erscheinen.",
    ].join("\n");
  }

  if (alert.module === "fim") {
    const changed = alert.message.match(/FIM:\s*(\S+)\s+geändert/)?.[1];
    return [
      "FIM (File Integrity Monitoring) hasht kritische Dateien per SSH.",
      "Standard-Pfade (FIM_PATHS):",
      "  · /etc/passwd — Benutzerkonten",
      "  · /etc/ssh/sshd_config — SSH-Server-Konfiguration",
      "  · /etc/sudoers — sudo-Rechte",
      "  · /root/.ssh/authorized_keys — Root-SSH-Keys",
      ...(changed
        ? [
            "",
            `Diese Meldung betrifft: ${changed}`,
            "Wenn du selbst einen Key hinzugefügt hast (Login aus den Log-Zeilen),",
            "ist das erwartet — Alert entschärfen. Sonst Key-Zeile prüfen/entfernen.",
          ]
        : []),
    ].join("\n");
  }

  if (
    alert.module === "security_posture" &&
    /Incident-Clearance|IOC-Prüfpunkte/i.test(alert.message)
  ) {
    return [
      "Dieser Eintrag ist nur eine Info: Im IOC-Zeitfenster wurden keine",
      "Indicators of Compromise gefunden (Domains/IPs aus BLOCKED_REMOTE_IPS",
      "und INCIDENT_IOC_DOMAINS). Das ist gut — kein Handlungsbedarf.",
      "",
      "Details stehen unter Sicherheit → Incident Clearance (alle Prüfpunkte).",
      "Neue Läufe erzeugen diese Info-Meldung nicht mehr in Benachrichtigungen.",
      "Alert kann entschärft werden.",
    ].join("\n");
  }

  if (
    alert.module === "docker" &&
    /high resources|CPU \d+%/i.test(alert.message)
  ) {
    return [
      "Momentaufnahme von `docker stats --no-stream` beim Check.",
      "Docker-CPU% = Anteil **eines** CPU-Kerns, nicht des ganzen Servers.",
      "100 % = ein Kern voll ausgelastet — auf Multicore oft normal",
      "(Nextcloud: Scan, Vorschau, Cron, Upload-Spike).",
      "",
      "MEM 0 % oft Anzeige ohne gesetztes Memory-Limit oder sehr wenig RAM.",
      "",
      "Entschärfen wenn bekannt belastet; bei Dauerlast: Ressourcen/Limits prüfen.",
      "Wiederholt bei jedem Check solange der Snapshot über Schwellwert liegt.",
    ].join("\n");
  }

  if (
    alert.module === "docker" &&
    /entfernt|ersetzt|removed|nicht Coolify-Deploy/i.test(alert.message)
  ) {
    return [
      "Ein Container aus dem letzten Snapshot fehlt jetzt in docker ps.",
      "Name backend-{id}-{timestamp} = Coolify-Backend-Container (Deploy ersetzt alten).",
      "",
      "Wenn Kurzüberblick „33/33 running“ und „0 unexpected stops“ zeigt:",
      "→ aktuell alles ok, nur der alte Container nach Redeploy weg.",
      "",
      "Prüfen: Coolify UI → Deployment-Log; docker ps | grep backend",
      "Bei erreichbarer App: Alert entschärfen.",
    ].join("\n");
  }

  if (
    alert.module === "logins" &&
    /unknown IP|Root login|Neuer Root-Login/i.test(alert.message)
  ) {
    return [
      "Neuer Root-Login von einer IP, die nicht in TRUSTED_LOGIN_IPS steht",
      "(10.0.1.* gilt intern als vertrauenswürdig).",
      "Historische Einträge in `last` lösen keinen wiederholten Alert mehr aus.",
      "",
      "Prüfen auf dem Server:",
      "  last -n 20 | grep root",
      "  journalctl -u ssh -n 20  # oder auth.log falls vorhanden",
      "",
      "Wenn du das warst: IP in .env.local TRUSTED_LOGIN_IPS eintragen.",
    ].join("\n");
  }

  if (
    alert.module === "network" &&
    /ausgehende Verbindung|Outbound/i.test(alert.message)
  ) {
    return [
      "Server hat eine neue ESTAB-Verbindung zu einer öffentlichen IP.",
      "Format: `remote ← local` (Gegenstelle links, lokaler Socket rechts).",
      "",
      "Wenn `local` Port 22/80/443 … war: eingehende Client-Verbindung",
      "(z. B. SSH) — wird künftig nicht mehr als „ausgehend“ gemeldet.",
      "",
      "Prüfen:",
      "  who",
      "  last -n 15",
      "  journalctl -u ssh -n 20  # falls kein /var/log/auth.log",
      "",
      "Bekannte Admin-IP: TRUSTED_LOGIN_IPS oder TRUSTED_OUTBOUND_IPS.",
    ].join("\n");
  }

  if (alert.module === "logins" && /fail2ban|ban/i.test(alert.message)) {
    return [
      "fail2ban unterscheidet zwei Zahlen:",
      "· „aktiv gebannt“ = IPs die gerade gesperrt sind",
      "· „Total banned“ = kumulierte Ban-Ereignisse seit Jail-Start",
      "Ein hoher Total-Delta bei moderatem „aktiv“ ist bei SSH-Angriffen normal",
      "(Bans laufen nach bantime ab, IPs können mehrfach gebannt werden).",
    ].join("\n");
  }

  return null;
}

function hostSection(ctx: AlertReportContext): string[] {
  const lines = ["BETROFFENER SERVER", "------------------"];
  if (ctx.hostLabel || ctx.hostIp) {
    lines.push(`Host: ${ctx.hostLabel ?? "—"} (${ctx.hostIp ?? "—"})`);
  }
  lines.push(`Prüfmodus: ${ctx.checkMode ?? getCheckMode()}`);
  return lines;
}

function checkContextSection(
  module: string,
  check: AlertCheckContext | null | undefined,
): string[] {
  if (!check) {
    return [
      "",
      "MODUL-KONTEXT",
      "-------------",
      "Kein gespeicherter Check-Lauf für dieses Modul.",
    ];
  }

  const detailLines = formatModuleDetailLines(module, check.data, {
    status: check.status,
    checkedAt: check.createdAt,
    metrics: null,
  });

  const logData = check.data as {
    criticalLines?: string[];
    warningLines?: string[];
  };

  const lines = [
    "",
    "MODUL-KONTEXT (letzter Check)",
    "-----------------------------",
    `Check-Status: ${check.status}`,
    `Zuletzt geprüft: ${formatDeDate(check.createdAt)}`,
  ];

  if (detailLines.length > 0) {
    lines.push("", "Kurzüberblick:");
    for (const line of detailLines) {
      lines.push(`  · ${line}`);
    }
  }

  if (module === "services") {
    const failed = (check.data.failedUnitNames ?? check.data.failedUnits) as
      | string[]
      | undefined;
    const ignored = check.data.ignoredFailedUnits as string[] | undefined;
    if (failed?.length) {
      lines.push("", "Failed Units (systemd):");
      for (const raw of failed) {
        const u = parseFailedUnitName(raw) ?? raw;
        lines.push(`  · ${u}`);
        lines.push(`    → systemctl status ${u}`);
      }
    }
    if (ignored?.length) {
      lines.push("", "Ignoriert (EXPECTED_FAILED_UNITS, harmlos):");
      for (const raw of ignored) {
        const u = parseFailedUnitName(raw) ?? raw;
        lines.push(`  · ${u}`);
      }
    }
  }

  if (logData.criticalLines?.length) {
    lines.push("", "Log-Zeilen (critical):");
    for (const line of logData.criticalLines) {
      lines.push(`  ${line}`);
    }
  }

  if (logData.warningLines?.length) {
    lines.push("", "Log-Zeilen (warning):");
    for (const line of logData.warningLines) {
      lines.push(`  ${line}`);
    }
  }

  if (module === "security_posture") {
    const data = check.data as {
      summaryLine?: string;
      window?: { logSince?: string; logUntil?: string; hours?: number; mode?: string };
      iocDomains?: string[];
      blockedIps?: string[];
      iocItems?: { label: string; status: string; detail: string; group?: string }[];
      scopeItems?: { label: string; status: string; detail: string }[];
      sshItems?: { label: string; status: string; detail: string }[];
      allPass?: boolean;
    };
    if (data.summaryLine) {
      lines.push("", "Zusammenfassung:", `  ${data.summaryLine}`);
    }
    if (data.window?.logSince) {
      lines.push(
        "",
        "Beobachtungsfenster (Logs):",
        `  ${data.window.logSince} → ${data.window.logUntil ?? "—"}`,
        `  Modus: ${data.window.mode ?? "—"}, ${data.window.hours ?? "?"}h`,
      );
    }
    if (data.iocDomains?.length || data.blockedIps?.length) {
      lines.push("", "IOC-Listen:");
      if (data.iocDomains?.length) {
        lines.push(`  Domains: ${data.iocDomains.join(", ")}`);
      }
      if (data.blockedIps?.length) {
        lines.push(`  IPs: ${data.blockedIps.join(", ")}`);
      }
    }
    const renderGroup = (
      title: string,
      items: { label: string; status: string; detail: string }[] | undefined,
    ) => {
      if (!items?.length) return;
      lines.push("", title);
      for (const item of items) {
        const icon =
          item.status === "pass" ? "✓" : item.status === "fail" ? "✗" : "!";
        lines.push(`  ${icon} ${item.label}: ${item.detail}`);
      }
    };
    renderGroup("IOC-Prüfpunkte (muss grün sein):", data.iocItems);
    renderGroup("Scope (Inventar-Stichprobe):", data.scopeItems);
    renderGroup("SSH-Härtung:", data.sshItems);
    if (data.allPass) {
      lines.push("", "Ergebnis: Keine IOC-Treffer im Fenster.");
    }
  }

  if (module === "docker") {
    const data = check.data as {
      running?: number;
      total?: number;
      stoppedUnexpected?: string[];
      containerChanges?: {
        changeType: string;
        name: string;
        label: string;
        previousValue?: string;
        newValue?: string;
      }[];
      inventory?: {
        foreignRunning?: { name: string; image: string; project?: string }[];
      };
    };
    if (data.running != null && data.total != null) {
      lines.push(
        "",
        "Aktueller Stand:",
        `  ${data.running}/${data.total} Container running`,
        `  Unerwartet gestoppt: ${data.stoppedUnexpected?.length ?? 0}`,
      );
    }
    if (data.containerChanges?.length) {
      lines.push("", "Änderungen seit letztem Snapshot:");
      for (const c of data.containerChanges) {
        lines.push(
          `  · ${c.changeType}: ${c.label}${c.previousValue ? ` (war: ${c.previousValue.slice(0, 40)})` : ""}`,
        );
      }
    }
    const foreign = data.inventory?.foreignRunning;
    if (foreign?.length) {
      lines.push("", "Fremde Container (nicht Coolify-Stack):");
      for (const f of foreign) {
        lines.push(`  · ${f.name} (${f.image})`);
      }
    }
  }

  if (module === "logins") {
    const root = check.data.lastRootLogin as
      | {
          line?: string;
          at?: string | null;
          active?: boolean;
          masked?: string;
          ip?: string;
        }
      | undefined;
    const recent = check.data.recentLogins as string[] | undefined;
    if (root?.line) {
      lines.push("", "Letzter Root-Login (last, Server-Zeit):");
      lines.push(`  ${root.line}`);
      if (root.at) {
        lines.push(
          `  → Zeitpunkt: ${root.at}${root.active ? " (Sitzung noch aktiv)" : ""}`,
        );
      }
    }
    const rootLines = recent?.filter((l) => l.startsWith("root ")).slice(0, 5);
    if (rootLines?.length) {
      lines.push("", "Weitere Root-Logins (last):");
      for (const l of rootLines) {
        lines.push(`  ${l}`);
      }
    }
  }

  return lines;
}

/** Einzelbericht zum Weiterleiten an Zuständige. */
export function buildAlertReport(
  alert: AlertReportInput,
  ctx: AlertReportContext = {},
): string {
  const appUrl = ctx.appUrl ?? process.env.APP_URL ?? "";
  const alertUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/alerts/${alert.id}` : "";
  const resolved = alert.resolvedAt != null;

  const lines = [
    "SYSTEM GUARDIAN — VORFALLBERICHT",
    "================================",
    `Bericht exportiert: ${formatDeDate(new Date())} (${APP_TIMEZONE})`,
    `Alert-ID: ${alert.id}`,
    `Status: ${resolved ? "geschlossen" : "offen"}`,
    `Alert erkannt: ${formatDeDate(alert.createdAt)} (${APP_TIMEZONE})`,
    ...(resolved && alert.resolvedAt
      ? [`Geschlossen am: ${formatDeDate(alert.resolvedAt)} (${APP_TIMEZONE})`]
      : []),
    "",
    ...hostSection(ctx),
    "",
    alert.level === "info" ? "HINWEIS" : "WARNUNG",
    alert.level === "info" ? "-------" : "-------",
    `Stufe: ${levelLabel(alert.level)}`,
    `Modul: ${moduleLabel(alert.module)} (${alert.module})`,
    ...(alert.notificationSent
      ? ["Benachrichtigung: Telegram/E-Mail/Discord gesendet"]
      : []),
    "",
    "MELDUNG",
    "-------",
    alert.message,
  ];

  if (alert.recommendation) {
    lines.push("", "EMPFEHLUNG / MASSNAHME", "--------------------", alert.recommendation);
  }

  const explanation = buildAlertExplanation(alert);
  if (explanation) {
    lines.push("", "EINORDNUNG", "----------", explanation);
  }

  lines.push(...checkContextSection(alert.module, ctx.check));

  if (alertUrl) {
    lines.push("", "LINK IM DASHBOARD", "-----------------", alertUrl);
  }

  lines.push(
    "",
    "---",
    "Automatisch generiert von System Guardian.",
    "Bitte bei Rückfragen Alert-ID und Zeitpunkt angeben.",
  );

  return lines.join("\n");
}

export type AlertBundleContext = AlertReportContext & {
  checksByModule?: Record<string, AlertCheckContext | null>;
};

/** Sammelbericht aller offenen Warnungen. */
export function buildAlertsBundleReport(
  alertList: AlertReportInput[],
  ctx: AlertBundleContext = {},
): string {
  if (alertList.length === 0) {
    return "SYSTEM GUARDIAN — keine offenen Warnungen.";
  }

  const appUrl = ctx.appUrl ?? process.env.APP_URL ?? "";

  const header = [
    "SYSTEM GUARDIAN — SAMMELBERICHT OFFENER WARNUNGEN",
    "=================================================",
    `Bericht erstellt: ${formatDeDate(new Date())}`,
    `Anzahl: ${alertList.length}`,
    "",
    ...hostSection(ctx),
    "",
    "ÜBERSICHT",
    "---------",
  ];

  for (let i = 0; i < alertList.length; i++) {
    const a = alertList[i];
    header.push(
      `${i + 1}. [${levelLabel(a.level)}] ${moduleLabel(a.module)} — ${a.message}`,
    );
    header.push(`   Zeit: ${formatDeDate(a.createdAt)} · ID: ${a.id}`);
    if (a.recommendation) {
      header.push(`   → ${a.recommendation}`);
    }
  }

  header.push("", "=".repeat(50), "");

  const sections = alertList.map((alert, i) => {
    const check =
      ctx.checksByModule?.[alert.module] ?? (i === 0 ? ctx.check : null);
    const body = buildAlertReport(alert, { ...ctx, check });
    return `--- Meldung ${i + 1} von ${alertList.length} ---\n\n${body}`;
  });

  if (appUrl) {
    header.push(
      "",
      "DASHBOARD",
      "---------",
      `${appUrl.replace(/\/$/, "")}/notifications`,
    );
  }

  return [...header, ...sections].join("\n");
}
