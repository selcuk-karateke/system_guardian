import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickStaleOpenAlerts } from "./pipeline";
import type { AlertInput } from "@/lib/checks/types";
import { isAgentEgressAlertMessage } from "@/lib/agent/ingest";

describe("pickStaleOpenAlerts", () => {
  const current: AlertInput[] = [
    { level: "warning", message: "Disk 90%" },
  ];

  it("keeps alerts whose message is still current", () => {
    const stale = pickStaleOpenAlerts(
      [{ id: "1", message: "Disk 90%" }],
      current,
    );
    assert.equal(stale.length, 0);
  });

  it("marks open alerts stale when cause disappeared", () => {
    const stale = pickStaleOpenAlerts(
      [
        { id: "1", message: "Disk 90%" },
        { id: "2", message: "Old hermes outbound critical" },
      ],
      current,
    );
    assert.deepEqual(
      stale.map((s) => s.id),
      ["2"],
    );
  });

  it("closes all when current check has no alerts", () => {
    const stale = pickStaleOpenAlerts(
      [{ id: "1", message: "anything" }],
      [],
    );
    assert.equal(stale.length, 1);
  });
});

describe("agent egress family filter", () => {
  it("classifies Mbps-spam rows as agent egress", () => {
    assert.equal(
      isAgentEgressAlertMessage(
        "Möglicher Datenabfluss: Egress 612.6 Mbit/s (Agent) · enp35s0 · docker-proxy → 10.0.1.35:80 · ↑ 0 B/s · aktiv",
      ),
      true,
    );
  });
});
