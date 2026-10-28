import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRemediationPlan,
  buildTrivyRecommendation,
  coolifyUuidFromMeta,
  groupFindingsByCve,
  primaryActionLabel,
} from "./remediation";
import type { TrivyScanRecord } from "./types";

describe("trivy remediation", () => {
  it("flags next as app_deps and says redeploy alone is not enough", () => {
    const plan = buildRemediationPlan([
      {
        vulnerabilityId: "CVE-2026-75604",
        severity: "CRITICAL",
        title: "RCE",
        pkgName: "next",
      },
      {
        vulnerabilityId: "CVE-2026-73420",
        severity: "CRITICAL",
        title: "auth",
        pkgName: "next-auth",
      },
    ]);
    assert.equal(plan.kind, "app_deps");
    assert.equal(plan.redeployHelpsAlone, false);
    assert.ok(plan.steps.some((s) => /16\.4\.1|15\.5\.28/.test(s)));
    assert.ok(plan.steps.some((s) => /ohne neuen Commit/i.test(s)));
  });

  it("treats zlib as os package where force rebuild can help", () => {
    const plan = buildRemediationPlan([
      {
        vulnerabilityId: "CVE-2023-45853",
        severity: "CRITICAL",
        title: "zlib",
        pkgName: "zlib1g",
      },
    ]);
    assert.equal(plan.kind, "os_packages");
    assert.equal(plan.redeployHelpsAlone, true);
  });

  it("marks OCR/base residual as not fixed by rebuild alone", () => {
    const plan = buildRemediationPlan([
      {
        vulnerabilityId: "CVE-2026-6653",
        severity: "CRITICAL",
        title: "libxml2",
        pkgName: "libxml2",
      },
      {
        vulnerabilityId: "CVE-2025-69720",
        severity: "HIGH",
        title: "ncurses",
        pkgName: "libncursesw6",
      },
      {
        vulnerabilityId: "CVE-2026-73066",
        severity: "HIGH",
        title: "tesseract",
        pkgName: "tesseract-ocr",
      },
    ]);
    assert.equal(plan.kind, "os_packages");
    assert.equal(plan.redeployHelpsAlone, false);
    assert.ok(plan.steps.some((s) => /Residual|Debian-Patch|OCR/i.test(s)));
    assert.ok(!plan.steps.some((s) => /Force-Rebuild \(ohne Cache\)/.test(s)));
  });

  it("includes Coolify app target in recommendation", () => {
    const record: TrivyScanRecord = {
      imageRef: "app:latest",
      imageDigest: "sha256:abcdef0123456789",
      containerName: "abc123",
      scannedAt: new Date().toISOString(),
      highCount: 0,
      criticalCount: 1,
      findings: [
        {
          vulnerabilityId: "CVE-1",
          severity: "CRITICAL",
          title: "x",
          pkgName: "next",
        },
      ],
      durationMs: 1,
    };
    const text = buildTrivyRecommendation(record, {
      projectName: "angebot-one",
      fqdn: "admin.angebot-one.com",
      coolifyName: "rtamvw4r4a62y8gkheeg0vi3",
      environmentName: "production",
      branch: "main",
    });
    assert.match(text, /angebot-one/);
    assert.match(text, /Coolify-UUID: rtamvw4r4a62y8gkheeg0vi3/);
    assert.match(text, /ohne neuen Commit/);
  });

  it("extracts coolify uuid from meta", () => {
    assert.equal(
      coolifyUuidFromMeta({ coolifyName: "rtamvw4r4a62y8gkheeg0vi3" }),
      "rtamvw4r4a62y8gkheeg0vi3",
    );
    assert.equal(coolifyUuidFromMeta({ coolifyName: "15" }), null);
  });

  it("groups util-linux package spam into one CVE row", () => {
    const grouped = groupFindingsByCve([
      {
        vulnerabilityId: "CVE-2026-76642",
        severity: "HIGH",
        title: "mount",
        pkgName: "util-linux",
      },
      {
        vulnerabilityId: "CVE-2026-76642",
        severity: "HIGH",
        title: "mount",
        pkgName: "libblkid1",
      },
      {
        vulnerabilityId: "CVE-2026-76642",
        severity: "HIGH",
        title: "mount",
        pkgName: "mount",
      },
    ]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].packages.length, 3);
    assert.equal(grouped[0].bucket, "residual");
    assert.match(primaryActionLabel(buildRemediationPlan(grouped.flatMap((g) =>
      g.packages.map((pkgName) => ({
        vulnerabilityId: g.vulnerabilityId,
        severity: g.severity,
        title: g.title,
        pkgName,
      })),
    ))), /Residual/i);
  });
});
