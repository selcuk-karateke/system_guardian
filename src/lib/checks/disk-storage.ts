/** Filesystem mounts + per-disk SMART / sysfs temperatures (Cockpit-style). */

export type DfMount = {
  filesystem: string;
  size: string;
  used: string;
  avail: string;
  usePercent: number;
  mountedOn: string;
};

export type DiskTemp = {
  /** Kernel name, e.g. sda / nvme0n1 */
  device: string;
  path: string;
  celsius: number | null;
};

/**
 * Marker so mock + logs can identify the probe.
 * NVMe: sysfs is under /sys/class/nvme/nvmeN (not /sys/block/nvmeNn1);
 * smartctl/nvme-cli often want the controller node (/dev/nvme0).
 */
export const DISK_TEMP_CMD = `echo SG_DISK_TEMP
read_milli() {
  f="$1"; [ -r "$f" ] || return 1
  v=$(cat "$f" 2>/dev/null || true)
  [ -n "$v" ] && [ "$v" -gt 0 ] 2>/dev/null || return 1
  echo $((v / 1000))
}
parse_smart_temp() {
  printf '%s\\n' "$1" | awk '
    /Temperature_Celsius|Airflow_Temperature_Cel/ {print $10; exit}
    /Current Drive Temperature/ {print $4; exit}
    /Temperature:/ && !/Comp\\. Temperature|Sensor/ {
      for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+(\\.[0-9]+)?$/) { print $i; exit }
    }
  '
}
for d in $(lsblk -dn -o NAME,TYPE 2>/dev/null | awk '$2=="disk"{print $1}'); do
  t=""
  ctrl=""
  case "$d" in
    nvme*n*) ctrl=$(printf '%s' "$d" | sed -E 's/n[0-9]+$//') ;;
  esac

  # 1) NVMe hwmon (Composite preferred) — works without smartctl, often without root
  if [ -z "$t" ] && [ -n "$ctrl" ]; then
    for hm in /sys/class/nvme/$ctrl/device/hwmon/hwmon*; do
      [ -d "$hm" ] || continue
      if [ -r "$hm/temp1_label" ] && grep -qi composite "$hm/temp1_label" 2>/dev/null; then
        t=$(read_milli "$hm/temp1_input") && break
      fi
      for lab in "$hm"/temp*_label; do
        [ -r "$lab" ] || continue
        grep -qi composite "$lab" 2>/dev/null || continue
        inp=$(printf '%s' "$lab" | sed 's/_label$/_input/')
        t=$(read_milli "$inp") && break 2
      done
      t=$(read_milli "$hm/temp1_input") && break
    done
  fi

  # 2) Block-device / drivetemp hwmon
  if [ -z "$t" ]; then
    for f in /sys/block/$d/device/hwmon/hwmon*/temp1_input \\
             /sys/block/$d/device/hwmon/hwmon*/temp*_input; do
      t=$(read_milli "$f") && break
    done
  fi

  # 3) smartctl on namespace + NVMe controller
  if [ -z "$t" ] && command -v smartctl >/dev/null 2>&1; then
    for dev in "/dev/$d" \${ctrl:+"/dev/$ctrl"}; do
      raw=$(smartctl -A "$dev" 2>/dev/null || true)
      t=$(parse_smart_temp "$raw")
      [ -n "$t" ] && break
    done
  fi

  # 4) nvme-cli smart-log
  if [ -z "$t" ] && command -v nvme >/dev/null 2>&1; then
    for dev in \${ctrl:+"/dev/$ctrl"} "/dev/$d"; do
      raw=$(nvme smart-log "$dev" 2>/dev/null || true)
      t=$(printf '%s\\n' "$raw" | awk '
        /^[Tt]emperature[ ]*:/ {
          for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+/) { print $i+0; exit }
        }
      ')
      [ -n "$t" ] && break
    done
  fi

  printf 'DISK\\t%s\\t%s\\n' "$d" "$t"
done`;

/** Parse `df -hP` rows (portable columns: FS Size Used Avail Use% Mounted). */
export function parseDfMounts(dfOut: string): DfMount[] {
  const rows: DfMount[] = [];
  for (const line of dfOut.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const use = parts[4]?.match(/^(\d+)%$/);
    if (!use) continue;
    rows.push({
      filesystem: parts[0]!,
      size: parts[1]!,
      used: parts[2]!,
      avail: parts[3]!,
      usePercent: parseInt(use[1]!, 10),
      mountedOn: parts.slice(5).join(" "),
    });
  }
  return rows;
}

function isRealBlockFs(filesystem: string): boolean {
  return (
    filesystem.startsWith("/dev/") ||
    filesystem.startsWith("/dev/mapper/") ||
    filesystem.startsWith("UUID=")
  );
}

function isVirtualFs(filesystem: string): boolean {
  return /^(tmpfs|devtmpfs|overlay|squashfs|efivarfs|udev)$/i.test(filesystem);
}

/** Real block mounts for UI (skip tmpfs/overlay). */
export function listBlockFilesystems(dfOut: string): DfMount[] {
  return parseDfMounts(dfOut).filter(
    (r) => !isVirtualFs(r.filesystem) && isRealBlockFs(r.filesystem),
  );
}

/** Max use% on real disks only — ignore tmpfs/overlay. */
export function parseDiskMax(dfOut: string): {
  percent: number;
  mount: string | null;
} {
  let max = 0;
  let mount: string | null = null;
  for (const row of listBlockFilesystems(dfOut)) {
    if (row.usePercent >= max) {
      max = row.usePercent;
      mount = row.mountedOn;
    }
  }
  return { percent: max, mount };
}

const WATCHED_TMPFS = new Set(["/tmp", "/var/tmp", "/dev/shm"]);

/** Watched tmpfs mounts at/over threshold. */
export function parseTmpfsAlerts(
  dfOut: string,
  warnAt = 90,
): { mount: string; percent: number }[] {
  return parseDfMounts(dfOut)
    .filter(
      (r) =>
        /^tmpfs$/i.test(r.filesystem) &&
        WATCHED_TMPFS.has(r.mountedOn) &&
        r.usePercent >= warnAt,
    )
    .map((r) => ({ mount: r.mountedOn, percent: r.usePercent }));
}

/** Parse `SG_DISK_TEMP` probe lines: DISK\\tname\\ttemp|. */
export function parseDiskTemps(out: string): DiskTemp[] {
  const rows: DiskTemp[] = [];
  for (const line of out.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("DISK")) continue;
    const parts = trimmed.split(/\t/);
    if (parts.length < 2) continue;
    const device = (parts[1] ?? "").trim();
    if (!device) continue;
    const raw = (parts[2] ?? "").trim();
    let celsius: number | null = null;
    if (raw && raw !== "na" && raw !== "-") {
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n > 0 && n < 200) celsius = Math.round(n);
    }
    rows.push({ device, path: `/dev/${device}`, celsius });
  }
  return rows;
}

export const DISK_TEMP_WARN_C = 50;
export const DISK_TEMP_CRIT_C = 60;
