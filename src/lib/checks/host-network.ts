/** Host network interfaces (Cockpit-style: addr, gateway, MTU, link). */

export type HostInterface = {
  name: string;
  mtu: number | null;
  /** operstate: up / down / unknown / … */
  state: string;
  linkUp: boolean;
  ipv4: string[];
  ipv6: string[];
  gateway4: string | null;
  gateway6: string | null;
};

/**
 * Text probe — avoids ip -j; works with busybox/iproute2.
 * Skips ephemeral virtual NICs; keeps lo + physical (+ bonds).
 */
export const HOST_NETWORK_CMD = `echo SG_NET_IFACES
for iface in $(ls -1 /sys/class/net 2>/dev/null); do
  case "$iface" in
    veth*|br-*|docker*|virbr*|tun*|tap*|wg*|tailscale*|zt*|cni*|flannel*|cali*|nodelocaldns*) continue ;;
  esac
  mtu=$(cat /sys/class/net/$iface/mtu 2>/dev/null || echo "")
  state=$(cat /sys/class/net/$iface/operstate 2>/dev/null || echo unknown)
  carrier=$(cat /sys/class/net/$iface/carrier 2>/dev/null || echo 0)
  printf 'IFACE\\t%s\\t%s\\t%s\\t%s\\n' "$iface" "$mtu" "$state" "$carrier"
done
ip -o -4 addr show 2>/dev/null | awk '
  {
    iface=$2; addr=$4;
    if (iface ~ /^(veth|br-|docker|virbr|tun|tap|wg|tailscale|zt|cni|flannel|cali)/) next;
    printf "ADDR4\\t%s\\t%s\\n", iface, addr
  }
'
ip -o -6 addr show 2>/dev/null | awk '
  {
    iface=$2; addr=$4;
    if (iface ~ /^(veth|br-|docker|virbr|tun|tap|wg|tailscale|zt|cni|flannel|cali)/) next;
    if (addr ~ /^fe80:/) next;
    printf "ADDR6\\t%s\\t%s\\n", iface, addr
  }
'
ip -4 route show default 2>/dev/null | awk '
  $1=="default" && $2=="via" {
    gw=$3; iface="";
    for (i=4;i<=NF;i++) if ($i=="dev") { iface=$(i+1); break }
    if (iface!="") printf "GW4\\t%s\\t%s\\n", iface, gw
  }
'
ip -6 route show default 2>/dev/null | awk '
  $1=="default" && $2=="via" {
    gw=$3; iface="";
    for (i=4;i<=NF;i++) if ($i=="dev") { iface=$(i+1); break }
    if (iface!="") printf "GW6\\t%s\\t%s\\n", iface, gw
  }
'`;

export function parseHostInterfaces(out: string): HostInterface[] {
  const map = new Map<string, HostInterface>();

  const ensure = (name: string): HostInterface => {
    let row = map.get(name);
    if (!row) {
      row = {
        name,
        mtu: null,
        state: "unknown",
        linkUp: false,
        ipv4: [],
        ipv6: [],
        gateway4: null,
        gateway6: null,
      };
      map.set(name, row);
    }
    return row;
  };

  for (const line of out.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "SG_NET_IFACES") continue;
    const parts = trimmed.split("\t");
    const kind = parts[0];
    if (kind === "IFACE" && parts.length >= 4) {
      const name = parts[1]!;
      const row = ensure(name);
      const mtu = parseInt(parts[2]!, 10);
      row.mtu = Number.isFinite(mtu) ? mtu : null;
      row.state = parts[3] || "unknown";
      const carrier = parts[4] === "1";
      row.linkUp = row.state === "up" || carrier;
    } else if (kind === "ADDR4" && parts.length >= 3) {
      const row = ensure(parts[1]!);
      const addr = parts[2]!;
      if (addr && !row.ipv4.includes(addr)) row.ipv4.push(addr);
    } else if (kind === "ADDR6" && parts.length >= 3) {
      const row = ensure(parts[1]!);
      const addr = parts[2]!;
      if (addr && !row.ipv6.includes(addr)) row.ipv6.push(addr);
    } else if (kind === "GW4" && parts.length >= 3) {
      const row = ensure(parts[1]!);
      if (parts[2]) row.gateway4 = parts[2]!;
    } else if (kind === "GW6" && parts.length >= 3) {
      const row = ensure(parts[1]!);
      if (parts[2]) row.gateway6 = parts[2]!;
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.name === "lo") return 1;
    if (b.name === "lo") return -1;
    return a.name.localeCompare(b.name);
  });
}

/** Primary uplink: first non-lo with link up and an IPv4, else first non-lo. */
export function primaryInterface(
  ifaces: HostInterface[],
): HostInterface | null {
  const real = ifaces.filter((i) => i.name !== "lo");
  return (
    real.find((i) => i.linkUp && i.ipv4.length > 0) ??
    real.find((i) => i.ipv4.length > 0) ??
    real[0] ??
    null
  );
}
