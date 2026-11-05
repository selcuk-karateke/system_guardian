import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatInventoryShort,
  inventoryFromCheckData,
  parseHostInventory,
} from "./host-inventory";

const SAMPLE = `HOSTNAME=terramaster
KERNEL=6.12.113+deb13-amd64
OS=Debian GNU/Linux 13 (trixie)
CPU=Intel(R) Celeron(R) CPU J1800 @ 2.41GHz
DATE=Thu Nov 5 21:26:16 2026
REBOOT=1
UPDATES=12;2
`;

describe("parseHostInventory", () => {
  it("parses Cockpit-style inventory fields", () => {
    const inv = parseHostInventory(SAMPLE);
    assert.equal(inv.hostname, "terramaster");
    assert.equal(inv.kernel, "6.12.113+deb13-amd64");
    assert.equal(inv.osPretty, "Debian GNU/Linux 13 (trixie)");
    assert.match(inv.cpuModel ?? "", /Celeron/);
    assert.equal(inv.rebootRequired, true);
    assert.equal(inv.updatesAvailable, 12);
    assert.equal(inv.securityUpdates, 2);
  });

  it("defaults updates when apt-check missing", () => {
    const inv = parseHostInventory(`HOSTNAME=x
KERNEL=1
REBOOT=0
UPDATES=
`);
    assert.equal(inv.updatesAvailable, 0);
    assert.equal(inv.rebootRequired, false);
  });
});

describe("formatInventoryShort", () => {
  it("builds monitor header line", () => {
    const s = formatInventoryShort(parseHostInventory(SAMPLE));
    assert.match(s ?? "", /terramaster/);
    assert.match(s ?? "", /6\.12\.113/);
    assert.match(s ?? "", /reboot/);
  });
});

describe("inventoryFromCheckData", () => {
  it("reads persisted check payload", () => {
    const inv = inventoryFromCheckData({
      hostname: "terramaster",
      kernel: "6.12",
      rebootRequired: true,
      updatesAvailable: 3,
      securityUpdates: 1,
    });
    assert.equal(inv?.hostname, "terramaster");
    assert.equal(inv?.rebootRequired, true);
  });
});
