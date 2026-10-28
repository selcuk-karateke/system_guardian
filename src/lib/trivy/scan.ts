import { getCheckMode } from "@/lib/config";
import { getDefaultServerId } from "@/lib/servers";
import { getSshClient } from "@/lib/ssh";
import { resolveLiveContainerName } from "./resolve-container";
import { getTrivyScanForDigest, saveTrivyScan } from "./store";
import type { TrivyFinding, TrivyScanRecord, TrivyScanResult } from "./types";

const SCAN_TIMEOUT_MS = 180_000;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseTrivyJson(stdout: string): TrivyFinding[] {
  const findings: TrivyFinding[] = [];
  try {
    const parsed = JSON.parse(stdout) as {
      Results?: Array<{
        Vulnerabilities?: Array<{
          VulnerabilityID?: string;
          Severity?: string;
          Title?: string;
          PkgName?: string;
        }>;
      }>;
    };
    for (const result of parsed.Results ?? []) {
      for (const vuln of result.Vulnerabilities ?? []) {
        const severity = (vuln.Severity ?? "").toUpperCase();
        if (severity !== "HIGH" && severity !== "CRITICAL") continue;
        findings.push({
          vulnerabilityId: vuln.VulnerabilityID ?? "unknown",
          severity,
          title: (vuln.Title ?? vuln.VulnerabilityID ?? "unknown").slice(0, 200),
          pkgName: vuln.PkgName,
        });
      }
    }
  } catch {
    /* ignore parse errors */
  }
  findings.sort((a, b) => {
    if (a.severity === b.severity) return a.vulnerabilityId.localeCompare(b.vulnerabilityId);
    return a.severity === "CRITICAL" ? -1 : 1;
  });
  return findings.slice(0, 25);
}

export async function scanContainerImage(
  containerName: string,
  options?: { force?: boolean; serverId?: string; coolifyUuid?: string | null },
): Promise<TrivyScanResult> {
  if (getCheckMode() !== "ssh") {
    return {
      ok: false,
      message: "Trivy-Scan nur mit CHECK_MODE=ssh (nicht im Mock-Modus per SSH)",
    };
  }

  const serverId = options?.serverId || (await getDefaultServerId());
  const ssh = await getSshClient(serverId);
  const started = Date.now();

  const resolved = await resolveLiveContainerName(
    ssh,
    containerName,
    options?.coolifyUuid,
  );
  if (resolved.name == null) {
    return { ok: false, message: resolved.message };
  }
  const liveName = resolved.name;
  const quoted = shellQuote(liveName);

  const imageRefRes = await ssh.exec(
    `docker inspect --format '{{.Config.Image}}' ${quoted} 2>&1`,
    15_000,
  );
  const imageRef = imageRefRes.stdout.trim();
  if (!imageRef || imageRefRes.code !== 0) {
    return {
      ok: false,
      message:
        imageRefRes.stderr.trim() || `Container ${liveName} nicht gefunden`,
    };
  }

  const digestRes = await ssh.exec(
    `docker inspect --format '{{.Image}}' ${quoted} 2>&1`,
    15_000,
  );
  const imageDigest = digestRes.stdout.trim();
  if (!imageDigest.startsWith("sha256:")) {
    return { ok: false, message: "Image-Digest konnte nicht gelesen werden" };
  }

  if (!options?.force) {
    const cached = await getTrivyScanForDigest(imageDigest);
    if (cached) {
      return {
        ok: true,
        record: { ...cached, containerName: liveName },
        cached: true,
        remappedFrom: resolved.remapped ? containerName : undefined,
      };
    }
  }

  const trivyCheck = await ssh.exec("command -v trivy 2>/dev/null", 5_000);
  if (!trivyCheck.stdout.trim()) {
    return {
      ok: false,
      message:
        "trivy nicht auf dem Host installiert (apt install trivy oder Binary in PATH)",
    };
  }

  const quotedImage = shellQuote(imageRef);
  const { stdout, stderr, code } = await ssh.exec(
    `trivy image --severity HIGH,CRITICAL --format json --quiet ${quotedImage} 2>&1`,
    SCAN_TIMEOUT_MS,
  );

  if (code !== 0 && !stdout.trim()) {
    return {
      ok: false,
      message: (stderr || stdout).trim().slice(0, 300) || "Trivy-Scan fehlgeschlagen",
    };
  }

  const findings = parseTrivyJson(stdout);
  const record: TrivyScanRecord = {
    imageRef,
    imageDigest,
    containerName: liveName,
    scannedAt: new Date().toISOString(),
    highCount: findings.filter((f) => f.severity === "HIGH").length,
    criticalCount: findings.filter((f) => f.severity === "CRITICAL").length,
    findings,
    durationMs: Date.now() - started,
  };

  await saveTrivyScan(record);
  return {
    ok: true,
    record,
    cached: false,
    remappedFrom: resolved.remapped ? containerName : undefined,
  };
}

/** Mock scan for CHECK_MODE=mock UI testing */
export async function mockScanContainerImage(
  containerName: string,
  imageRef: string,
): Promise<TrivyScanResult> {
  const digest = `sha256:mock${containerName.slice(0, 8).padEnd(8, "0")}`;
  const record: TrivyScanRecord = {
    imageRef,
    imageDigest: digest,
    containerName,
    scannedAt: new Date().toISOString(),
    highCount: containerName.includes("wordpress") ? 1 : 0,
    criticalCount: 0,
    findings:
      containerName.includes("wordpress")
        ? [
            {
              vulnerabilityId: "CVE-2024-0000",
              severity: "HIGH",
              title: "Mock finding (CHECK_MODE=mock)",
              pkgName: "example-pkg",
            },
          ]
        : [],
    durationMs: 120,
  };
  await saveTrivyScan(record);
  return { ok: true, record, cached: false };
}
