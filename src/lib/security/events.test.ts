import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ParsedConnection } from "@/lib/checks/connection-patterns";
import {
  alertInputFromFail2banBanSpikeEvent,
  alertInputFromSsSecurityEvents,
  clearanceFieldsFromSsSecurityEvents,
  alertFromSecurityEvent,
  fail2banBanSpikeToSecurityEvent,
  findSecurityRule,
  suspiciousSsHitToSecurityEvent,
  type SecurityEvent,
} from "./events";
import { formatSinceLastCheck, isBanSpike } from "@/lib/checks/fail2ban-metrics";

const SERVER_ID = "server-test-001";

function sampleConn(overrides: Partial<ParsedConnection> = {}): ParsedConnection {
  return {
    proto: "tcp",
    state: "ESTAB",
    local: "10.0.1.5:54321",
    remote: "1.2.3.4:443",
    remoteIp: "1.2.3.4",
    remotePort: "443",
    process: 'users:(("hermes",pid=1,fd=3))',
    ...overrides,
  };
}

describe("suspiciousSsHitToSecurityEvent", () => {
  it("maps untrusted HTTPS hit to warning event with serverId and occurredAt", () => {
    const conn = sampleConn();
    const hit = {
      severity: "warning" as const,
      reason: "Outbound 443 to 1.2.3.4 (users:((\"hermes\",pid=1,fd=3)))",
    };
    const raw =
      'tcp ESTAB 0 0 10.0.1.5:54321 1.2.3.4:443 users:(("hermes",pid=1,fd=3))';
    const occurredAt = new Date("2026-10-05T10:00:00.000Z");

    const event = suspiciousSsHitToSecurityEvent(conn, hit, {
      serverId: SERVER_ID,
      rawLine: raw,
      occurredAt,
    });

    assert.equal(event.ruleId, "ss.untrusted_http_outbound");
    assert.equal(event.source, "ss.tunap");
    assert.equal(event.severity, "warning");
    assert.equal(event.entity, "1.2.3.4:443");
    assert.equal(event.raw, raw);
    assert.equal(event.metadata.reason, hit.reason);
    assert.equal(event.metadata.remoteIp, "1.2.3.4");
    assert.equal(event.serverId, SERVER_ID);
    assert.equal(event.occurredAt.toISOString(), occurredAt.toISOString());
  });

  it("defaults occurredAt to now when omitted", () => {
    const before = Date.now();
    const event = suspiciousSsHitToSecurityEvent(
      sampleConn({ remote: "9.9.9.9:4444", remoteIp: "9.9.9.9", remotePort: "4444" }),
      {
        severity: "critical",
        reason: "Connection to port 4444 (9.9.9.9:4444)",
      },
      { serverId: SERVER_ID },
    );
    const after = Date.now();

    assert.equal(event.ruleId, "ss.suspicious_port");
    assert.equal(event.serverId, SERVER_ID);
    assert.ok(event.occurredAt.getTime() >= before);
    assert.ok(event.occurredAt.getTime() <= after);
  });
});

describe("alertInputFromSsSecurityEvents", () => {
  it("returns null for empty list", () => {
    assert.equal(alertInputFromSsSecurityEvents([]), null);
  });

  it("preserves previous warning alert shape", () => {
    const events = [
      suspiciousSsHitToSecurityEvent(
        sampleConn(),
        {
          severity: "warning",
          reason: "Outbound 443 to 1.2.3.4 (hermes)",
        },
        { serverId: SERVER_ID, rawLine: "raw-line" },
      ),
    ];

    const alert = alertInputFromSsSecurityEvents(events);
    assert.ok(alert);
    assert.equal(alert.level, "warning");
    assert.equal(
      alert.message,
      "Unbekannte ausgehende Verbindungen: Outbound 443 to 1.2.3.4 (hermes)",
    );
  });

  it("preserves previous critical alert shape when any event is critical", () => {
    const events = [
      suspiciousSsHitToSecurityEvent(sampleConn(), {
        severity: "warning",
        reason: "Outbound 443 to 1.2.3.4 (hermes)",
      }, { serverId: SERVER_ID }),
      suspiciousSsHitToSecurityEvent(
        sampleConn({ remotePort: "4444", remote: "9.9.9.9:4444", remoteIp: "9.9.9.9" }),
        {
          severity: "critical",
          reason: "Connection to port 4444 (9.9.9.9:4444)",
        },
        { serverId: SERVER_ID },
      ),
    ];

    const alert = alertInputFromSsSecurityEvents(events);
    assert.ok(alert);
    assert.equal(alert.level, "critical");
    assert.match(alert.message, /^Verdächtige ausgehende Verbindungen:/);
    assert.match(alert.message, /Outbound 443/);
    assert.match(alert.message, /port 4444/);
  });
});

describe("clearanceFieldsFromSsSecurityEvents", () => {
  it("matches legacy connections_other fields", () => {
    const events = [
      suspiciousSsHitToSecurityEvent(sampleConn(), {
        severity: "warning",
        reason: "Outbound 443 to 1.2.3.4 (a)",
      }, { serverId: SERVER_ID }),
      suspiciousSsHitToSecurityEvent(sampleConn({ remoteIp: "5.6.7.8" }), {
        severity: "warning",
        reason: "Outbound 443 to 5.6.7.8 (b)",
      }, { serverId: SERVER_ID }),
      suspiciousSsHitToSecurityEvent(sampleConn({ remoteIp: "8.8.8.8" }), {
        severity: "warning",
        reason: "Outbound 443 to 8.8.8.8 (c)",
      }, { serverId: SERVER_ID }),
      suspiciousSsHitToSecurityEvent(sampleConn({ remoteIp: "9.9.9.9" }), {
        severity: "warning",
        reason: "Outbound 443 to 9.9.9.9 (d-ignored)",
      }, { serverId: SERVER_ID }),
    ];

    const fields = clearanceFieldsFromSsSecurityEvents(events);
    assert.ok(fields);
    assert.equal(fields.status, "warn");
    assert.equal(fields.label, "Unbekannte ausgehende Verbindungen");
    assert.equal(
      fields.detail,
      "Outbound 443 to 1.2.3.4 (a); Outbound 443 to 5.6.7.8 (b); Outbound 443 to 8.8.8.8 (c)",
    );
    assert.ok(!fields.detail.includes("d-ignored"));
  });
});

describe("fail2banBanSpikeToSecurityEvent", () => {
  it("maps ban spike using existing isBanSpike metrics into SecurityEvent", () => {
    const prevTotal = 10;
    const currTotal = 200;
    const hoursSince = 1;
    const { spike, delta, ratePerHour } = isBanSpike(
      prevTotal,
      currTotal,
      hoursSince,
    );
    assert.equal(spike, true);
    assert.ok(ratePerHour >= 40);

    const occurredAt = new Date("2026-10-05T12:00:00.000Z");
    const event = fail2banBanSpikeToSecurityEvent({
      serverId: SERVER_ID,
      prevTotal,
      currTotal,
      currentlyBanned: 12,
      hoursSince,
      delta,
      jail: "sshd",
      occurredAt,
    });

    const sinceLabel = formatSinceLastCheck(hoursSince);
    assert.equal(event.ruleId, "fail2ban.ban_spike");
    assert.equal(event.source, "fail2ban.sshd");
    assert.equal(event.severity, "warning");
    assert.equal(event.entity, "sshd");
    assert.equal(event.serverId, SERVER_ID);
    assert.equal(event.occurredAt.toISOString(), occurredAt.toISOString());
    assert.equal(
      event.metadata.reason,
      `fail2ban Ban-Spike: +${delta} Ereignisse in ${sinceLabel} (Total ${prevTotal}→${currTotal}, 12 aktiv)`,
    );
  });
});

describe("alertInputFromFail2banBanSpikeEvent", () => {
  it("preserves previous ban-spike alert text and recommendation", () => {
    const hoursSince = 2;
    const delta = 150;
    const event = fail2banBanSpikeToSecurityEvent({
      serverId: SERVER_ID,
      prevTotal: 50,
      currTotal: 200,
      currentlyBanned: 5,
      hoursSince,
      delta,
    });
    const alert = alertInputFromFail2banBanSpikeEvent(event);
    const sinceLabel = formatSinceLastCheck(hoursSince);

    assert.equal(alert.level, "warning");
    assert.equal(
      alert.message,
      `fail2ban Ban-Spike: +${delta} Ereignisse in ${sinceLabel} (Total 50→200, 5 aktiv)`,
    );
    assert.equal(
      alert.recommendation,
      "Review auth.log for coordinated SSH attack",
    );
  });
});

describe("alertFromSecurityEvent", () => {
  it("ss-Event findet passende Alert-Rule (network.suspicious_connection)", () => {
    const event = suspiciousSsHitToSecurityEvent(
      sampleConn(),
      {
        severity: "warning",
        reason: "Outbound 443 to 1.2.3.4 (hermes)",
      },
      { serverId: SERVER_ID },
    );

    const rule = findSecurityRule(event);
    assert.ok(rule);
    assert.equal(rule.id, "network.suspicious_connection");

    const alert = alertFromSecurityEvent(event);
    assert.ok(alert);
    assert.equal(alert.level, "warning");
    assert.equal(
      alert.message,
      "Unbekannte ausgehende Verbindungen: Outbound 443 to 1.2.3.4 (hermes)",
    );
  });

  it("fail2ban-Event findet passende Alert-Rule", () => {
    const hoursSince = 2;
    const delta = 150;
    const event = fail2banBanSpikeToSecurityEvent({
      serverId: SERVER_ID,
      prevTotal: 50,
      currTotal: 200,
      currentlyBanned: 5,
      hoursSince,
      delta,
    });

    const rule = findSecurityRule(event);
    assert.ok(rule);
    assert.equal(rule.id, "fail2ban.ban_spike");

    const alert = alertFromSecurityEvent(event);
    const sinceLabel = formatSinceLastCheck(hoursSince);
    assert.ok(alert);
    assert.equal(alert.level, "warning");
    assert.equal(
      alert.message,
      `fail2ban Ban-Spike: +${delta} Ereignisse in ${sinceLabel} (Total 50→200, 5 aktiv)`,
    );
    assert.equal(
      alert.recommendation,
      "Review auth.log for coordinated SSH attack",
    );
  });

  it("unbekannte ruleId → kein Alert", () => {
    const unknown: SecurityEvent = {
      ruleId: "unknown.rule",
      source: "test",
      severity: "warning",
      raw: "x",
      entity: "x",
      metadata: {},
      serverId: SERVER_ID,
      occurredAt: new Date(),
    };

    assert.equal(findSecurityRule(unknown), null);
    assert.equal(alertFromSecurityEvent(unknown), null);
  });
});
