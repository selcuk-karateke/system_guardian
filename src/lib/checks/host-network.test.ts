import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseHostInterfaces,
  primaryInterface,
} from "./host-network";

const SAMPLE = `SG_NET_IFACES
IFACE	enp2s0	1500	up	1
IFACE	lo	65536	unknown	1
ADDR4	enp2s0	192.168.0.52/24
ADDR6	enp2s0	2a02:8109:f681:100::4dff/128
ADDR4	lo	127.0.0.1/8
GW4	enp2s0	192.168.0.1
GW6	enp2s0	fe80::1
`;

describe("parseHostInterfaces", () => {
  it("builds Cockpit-style rows", () => {
    const rows = parseHostInterfaces(SAMPLE);
    assert.equal(rows.length, 2);
    const nic = rows.find((r) => r.name === "enp2s0");
    assert.ok(nic);
    assert.equal(nic.mtu, 1500);
    assert.equal(nic.linkUp, true);
    assert.deepEqual(nic.ipv4, ["192.168.0.52/24"]);
    assert.deepEqual(nic.ipv6, ["2a02:8109:f681:100::4dff/128"]);
    assert.equal(nic.gateway4, "192.168.0.1");
    assert.equal(nic.gateway6, "fe80::1");
    assert.equal(rows[rows.length - 1]?.name, "lo");
  });
});

describe("primaryInterface", () => {
  it("picks linked uplink over lo", () => {
    const p = primaryInterface(parseHostInterfaces(SAMPLE));
    assert.equal(p?.name, "enp2s0");
  });
});
