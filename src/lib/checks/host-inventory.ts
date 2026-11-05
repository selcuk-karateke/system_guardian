/**
 * Host inventory fields (Cockpit-style) collected with server_health.
 */

export type HostInventory = {
  hostname: string | null;
  osPretty: string | null;
  kernel: string | null;
  cpuModel: string | null;
  systemTime: string | null;
  rebootRequired: boolean;
  updatesAvailable: number;
  securityUpdates: number;
};

export const HOST_INVENTORY_CMD = [
  `echo "HOSTNAME=$(hostname -f 2>/dev/null || hostname 2>/dev/null || true)"`,
  `echo "KERNEL=$(uname -r 2>/dev/null || true)"`,
  `echo "OS=$(grep -m1 '^PRETTY_NAME=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"')"`,
  `echo "CPU=$(grep -m1 '^model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^[[:space:]]*//' || true)"`,
  `echo "DATE=$(date '+%a %b %-d %H:%M:%S %Y' 2>/dev/null || date 2>/dev/null || true)"`,
  `echo "REBOOT=$(test -f /var/run/reboot-required && echo 1 || echo 0)"`,
  // update-notifier apt-check → "total;security" on stderr; fallback 0;0
  `echo "UPDATES=$(/usr/lib/update-notifier/apt-check 2>&1 | head -1 | tr -cd '0-9;' || printf '0;0')"`,
].join("; ");

function clean(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v || v === "unknown" || v === "null") return null;
  return v;
}

export function parseHostInventory(stdout: string): HostInventory {
  const map = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const i = line.indexOf("=");
    if (i <= 0) continue;
    map.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }

  const updatesRaw = map.get("UPDATES") ?? "0;0";
  const [totalStr, secStr] = updatesRaw.split(";");
  const updatesAvailable = Math.max(0, parseInt(totalStr ?? "0", 10) || 0);
  const securityUpdates = Math.max(0, parseInt(secStr ?? "0", 10) || 0);

  return {
    hostname: clean(map.get("HOSTNAME")),
    osPretty: clean(map.get("OS")),
    kernel: clean(map.get("KERNEL")),
    cpuModel: clean(map.get("CPU")),
    systemTime: clean(map.get("DATE")),
    rebootRequired: map.get("REBOOT") === "1",
    updatesAvailable,
    securityUpdates,
  };
}

export function inventoryFromCheckData(
  data: Record<string, unknown> | null | undefined,
): HostInventory | null {
  if (!data) return null;
  const hasAny =
    data.hostname != null ||
    data.kernel != null ||
    data.osPretty != null ||
    data.cpuModel != null ||
    data.rebootRequired != null ||
    data.updatesAvailable != null;
  if (!hasAny) return null;

  return {
    hostname: typeof data.hostname === "string" ? data.hostname : null,
    osPretty: typeof data.osPretty === "string" ? data.osPretty : null,
    kernel: typeof data.kernel === "string" ? data.kernel : null,
    cpuModel: typeof data.cpuModel === "string" ? data.cpuModel : null,
    systemTime: typeof data.systemTime === "string" ? data.systemTime : null,
    rebootRequired: data.rebootRequired === true,
    updatesAvailable:
      typeof data.updatesAvailable === "number" ? data.updatesAvailable : 0,
    securityUpdates:
      typeof data.securityUpdates === "number" ? data.securityUpdates : 0,
  };
}

/** Monitor header / uptime subline: `terramaster · 6.12.113 · reboot` */
export function formatInventoryShort(inv: HostInventory): string | null {
  const parts: string[] = [];
  if (inv.hostname) parts.push(inv.hostname);
  if (inv.kernel) {
    // shorten "6.12.113+deb13-amd64" → keep full if short enough
    parts.push(
      inv.kernel.length > 28 ? inv.kernel.slice(0, 27) + "…" : inv.kernel,
    );
  }
  if (inv.rebootRequired) parts.push("reboot");
  else if (inv.securityUpdates > 0) {
    parts.push(`${inv.securityUpdates} sec-upd`);
  } else if (inv.updatesAvailable > 0) {
    parts.push(`${inv.updatesAvailable} upd`);
  }
  return parts.length ? parts.join(" · ") : null;
}
