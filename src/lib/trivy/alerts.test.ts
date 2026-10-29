import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CoolifyMeta } from "@/lib/checks/coolify-meta";
import { normalizeContainerName } from "@/lib/checks/coolify-meta";
import {
  alertInputFromTrivyRecord,
  appCriticalCount,
  buildTrivyAlerts,
  filterLiveTrivyRecords,
  formatTrivyAlertLabel,
  isCoolifyPreviewContainer,
  stripCoolifyContainerSuffix,
  trivyAlertLevel,
  trivyAlertMessage,
  trivyGroupKey,
} from "./alerts";
import type { TrivyScanRecord } from "./types";

const base: TrivyScanRecord = {
  imageRef: "app:latest",
  imageDigest: "sha256:abcdef0123456789",
  containerName: "my-app",
  scannedAt: new Date().toISOString(),
  highCount: 2,
  criticalCount: 0,
  findings: [
    {
      vulnerabilityId: "CVE-2026-1",
      severity: "HIGH",
      title: "x",
      pkgName: "next",
    },
  ],
  durationMs: 10,
};

describe("trivy alerts", () => {
  it("builds warning for HIGH only", () => {
    const alert = alertInputFromTrivyRecord(base);
    assert.ok(alert);
    assert.equal(alert.level, "warning");
    assert.match(alert.message, /2 high/);
    assert.match(alert.recommendation ?? "", /Scan Neu|Coolify|Deps|Fix|next/i);
  });

  it("critical only when App-bucket CRITICAL on production", () => {
    const alert = alertInputFromTrivyRecord(
      {
        ...base,
        criticalCount: 1,
        highCount: 5,
        findings: [
          {
            vulnerabilityId: "CVE-CRIT",
            severity: "CRITICAL",
            title: "x",
            pkgName: "next",
          },
        ],
      },
      { projectName: "website", environmentName: "production" },
    );
    assert.equal(alert?.level, "critical");
    assert.match(alert?.message ?? "", /website \(production\)/);
    assert.doesNotMatch(alert?.message ?? "", /digest/);
  });

  it("demotes residual/stdlib CRITICAL to warning", () => {
    const alert = alertInputFromTrivyRecord(
      {
        ...base,
        criticalCount: 2,
        highCount: 1,
        findings: [
          {
            vulnerabilityId: "CVE-STD",
            severity: "CRITICAL",
            title: "go",
            pkgName: "stdlib",
          },
          {
            vulnerabilityId: "CVE-SUDO",
            severity: "CRITICAL",
            title: "sudo",
            pkgName: "sudo",
          },
        ],
      },
      { projectName: "zomboid", environmentName: "production" },
    );
    assert.equal(alert?.level, "warning");
    assert.equal(appCriticalCount(alert ? base.findings : []), 0);
  });

  it("demotes staging/dev CRITICAL to warning", () => {
    const level = trivyAlertLevel(
      [
        {
          vulnerabilityId: "CVE-1",
          severity: "CRITICAL",
          title: "x",
          pkgName: "next",
        },
      ],
      1,
      5,
      { projectName: "trading", environmentName: "staging" },
    );
    assert.equal(level, "warning");
  });

  it("demotes managed database CRITICAL to warning", () => {
    const alert = alertInputFromTrivyRecord(
      {
        ...base,
        criticalCount: 2,
        highCount: 23,
        findings: [
          {
            vulnerabilityId: "GHSA-cert",
            severity: "CRITICAL",
            title: "certifi",
            pkgName: "certifi",
          },
          {
            vulnerabilityId: "CVE-STD",
            severity: "CRITICAL",
            title: "go",
            pkgName: "stdlib",
          },
        ],
      },
      {
        projectName: "lebenslauf",
        environmentName: "production",
        type: "database",
        serviceName: "mysql",
        databaseSubType: "mysql",
      },
    );
    assert.equal(alert?.level, "warning");
    assert.match(alert?.recommendation ?? "", /Managed DB|WARNING/i);
  });

  it("returns null when clean", () => {
    assert.equal(
      alertInputFromTrivyRecord({ ...base, highCount: 0, criticalCount: 0 }),
      null,
    );
  });

  it("groups multiple images of same app/env", () => {
    const meta: CoolifyMeta = {
      projectName: "dachpro",
      environmentName: "development",
    };
    const a: TrivyScanRecord = {
      ...base,
      containerName: "aig0ql9hlb5gt94zllg14urr-1",
      criticalCount: 5,
      highCount: 20,
      findings: [
        {
          vulnerabilityId: "CVE-A",
          severity: "CRITICAL",
          title: "x",
          pkgName: "next",
        },
      ],
    };
    const b: TrivyScanRecord = {
      ...base,
      containerName: "txnc0e2ap4siwvz8i797909q-2",
      imageDigest: "sha256:bbbbbbbbbbbbbbbb",
      criticalCount: 3,
      highCount: 10,
      findings: [
        {
          vulnerabilityId: "CVE-B",
          severity: "CRITICAL",
          title: "y",
          pkgName: "next",
        },
      ],
    };
    const coolify = new Map<string, CoolifyMeta>([
      [normalizeContainerName(a.containerName), meta],
      [normalizeContainerName(b.containerName), meta],
    ]);
    const alerts = buildTrivyAlerts([a, b], coolify);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0]!.message, /dachpro \(development\)/);
    assert.match(alerts[0]!.message, /5 crit \/ 20 high/);
    assert.match(alerts[0]!.message, /2 images/);
    assert.equal(alerts[0]!.level, "warning"); // development
  });

  it("strips coolify suffixes for fallback labels", () => {
    assert.equal(
      stripCoolifyContainerSuffix("vaultwarden-w4kkwkocc040cs40cc4wccs8"),
      "vaultwarden",
    );
    assert.match(
      formatTrivyAlertLabel({
        ...base,
        containerName: "vaultwarden-w4kkwkocc040cs40cc4wccs8",
      }),
      /vaultwarden/,
    );
  });

  it("stable group key uses project+env+kind", () => {
    assert.equal(
      trivyGroupKey(base, {
        projectName: "Website",
        environmentName: "Production",
        serviceName: "web",
      }),
      "proj:website|env:production|app",
    );
    assert.equal(
      trivyGroupKey(base, {
        projectName: "Website",
        environmentName: "Production",
        type: "database",
        databaseSubType: "postgresql",
      }),
      "proj:website|env:production|db:postgresql",
    );
    assert.equal(
      trivyGroupKey(base, {
        projectName: "nextcloud",
        environmentName: "production",
        serviceName: "redis",
      }),
      "proj:nextcloud|env:production|sidecar:redis",
    );
  });

  it("message helper omits digest", () => {
    assert.equal(
      trivyAlertMessage("website (production)", 3, 18),
      "Trivy website (production): 3 crit / 18 high",
    );
  });

  it("detects Coolify preview container names", () => {
    assert.equal(
      isCoolifyPreviewContainer("a0o4oo8kco000sg8wckoscss-pr-2"),
      true,
    );
    assert.equal(
      isCoolifyPreviewContainer("a0o4oo8kco000sg8wckoscss-20261029T001949"),
      false,
    );
  });

  it("ignores stopped digests and preview containers for alerts", () => {
    const meta: CoolifyMeta = {
      projectName: "website",
      environmentName: "production",
    };
    const live: TrivyScanRecord = {
      ...base,
      containerName: "a0o4oo8kco000sg8wckoscss-20261029T001949",
      criticalCount: 0,
      highCount: 2,
      findings: [
        {
          vulnerabilityId: "CVE-H",
          severity: "HIGH",
          title: "x",
          pkgName: "stdlib",
        },
      ],
    };
    const dead: TrivyScanRecord = {
      ...base,
      containerName: "a0o4oo8kco000sg8wckoscss-old",
      imageDigest: "sha256:deaddeaddeaddead",
      criticalCount: 5,
      highCount: 20,
      findings: [
        {
          vulnerabilityId: "CVE-OLD",
          severity: "CRITICAL",
          title: "x",
          pkgName: "next",
        },
      ],
    };
    const preview: TrivyScanRecord = {
      ...base,
      containerName: "a0o4oo8kco000sg8wckoscss-pr-2",
      imageDigest: "sha256:prevprevprevprev",
      criticalCount: 5,
      highCount: 20,
      findings: [
        {
          vulnerabilityId: "CVE-PR",
          severity: "CRITICAL",
          title: "x",
          pkgName: "next",
        },
      ],
    };
    const coolify = new Map<string, CoolifyMeta>([
      [normalizeContainerName(live.containerName), meta],
      [normalizeContainerName(dead.containerName), meta],
      [normalizeContainerName(preview.containerName), meta],
    ]);
    const filtered = filterLiveTrivyRecords([live, dead, preview], new Set([live.containerName]));
    assert.equal(filtered.length, 1);
    const alerts = buildTrivyAlerts(filtered, coolify);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.level, "warning");
    assert.match(alerts[0]!.message, /0 crit \/ 2 high/);
    assert.doesNotMatch(alerts[0]!.message, /5 crit/);
  });
});
