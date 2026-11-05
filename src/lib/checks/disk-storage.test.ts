import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listBlockFilesystems,
  parseDfMounts,
  parseDiskMax,
  parseDiskTemps,
  parseTmpfsAlerts,
} from "./disk-storage";

const REAL_DF = `Filesystem      Size  Used Avail Use% Mounted on
udev             32G     0   32G   0% /dev
tmpfs           6.3G  4.8M  6.3G   1% /run
/dev/md2        906G  533G  328G  62% /
tmpfs            32G   32G  1.8M 100% /tmp
/dev/md1        989M  149M  789M  16% /boot
overlay         906G  533G  328G  62% /var/lib/docker/rootfs/overlayfs/abc
/dev/dm-0       9.1T  1.1T  8.0T  12% /mnt/storage
`;

describe("parseDiskMax", () => {
  it("ignores full tmpfs and reports real root use%", () => {
    assert.deepEqual(parseDiskMax(REAL_DF), { percent: 62, mount: "/" });
  });

  it("returns 0 when only virtual mounts exist", () => {
    assert.deepEqual(
      parseDiskMax(`Filesystem Size Used Avail Use% Mounted on
tmpfs 1G 1G 0 100% /tmp
`),
      { percent: 0, mount: null },
    );
  });
});

describe("parseTmpfsAlerts", () => {
  it("flags /tmp at 100% without treating it as disk", () => {
    assert.deepEqual(parseTmpfsAlerts(REAL_DF), [
      { mount: "/tmp", percent: 100 },
    ]);
  });

  it("ignores tiny /run tmpfs", () => {
    assert.equal(
      parseTmpfsAlerts(REAL_DF).some((t) => t.mount === "/run"),
      false,
    );
  });
});

describe("parseDfMounts / listBlockFilesystems", () => {
  it("parses size/used/avail columns", () => {
    const rows = parseDfMounts(REAL_DF);
    const root = rows.find((r) => r.mountedOn === "/");
    assert.equal(root?.usePercent, 62);
    assert.equal(root?.size, "906G");
    assert.equal(root?.used, "533G");
    assert.equal(root?.avail, "328G");
  });

  it("lists only real block mounts", () => {
    const blocks = listBlockFilesystems(REAL_DF);
    assert.deepEqual(
      blocks.map((b) => b.filesystem),
      ["/dev/md2", "/dev/md1", "/dev/dm-0"],
    );
  });
});

describe("parseDiskTemps", () => {
  it("parses SMART probe lines and k. A.", () => {
    const rows = parseDiskTemps(`SG_DISK_TEMP
DISK	sda	36
DISK	sdb	34
DISK	sdc	
DISK	nvme0n1	42.5
DISK	nvme1n1	38
`);
    assert.deepEqual(rows, [
      { device: "sda", path: "/dev/sda", celsius: 36 },
      { device: "sdb", path: "/dev/sdb", celsius: 34 },
      { device: "sdc", path: "/dev/sdc", celsius: null },
      { device: "nvme0n1", path: "/dev/nvme0n1", celsius: 43 },
      { device: "nvme1n1", path: "/dev/nvme1n1", celsius: 38 },
    ]);
  });
});
