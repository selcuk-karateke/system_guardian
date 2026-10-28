"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runContainerTrivyScan } from "@/app/actions/docker-trivy";
import { triggerCoolifyRedeployAction } from "@/app/actions/protect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DockerInventoryGroup } from "@/lib/docker/inventory";
import {
  buildRemediationPlan,
  groupFindingsByCve,
  primaryActionLabel,
  type FindingBucket,
} from "@/lib/trivy/remediation";
import type { TrivyScanRecord } from "@/lib/trivy/types";

type Props = {
  groups: DockerInventoryGroup[];
  checkMode: string;
  scansByImage: Record<string, TrivyScanRecord>;
  serverId?: string;
  coolifyRedeployReady?: boolean;
};

type RowStatus = {
  kind: "ok" | "error" | "info";
  text: string;
};

function shortDigest(image: string): string {
  if (image.startsWith("sha256:")) return image.slice(7, 19);
  const tag = image.split(":").pop() ?? image;
  return tag.length > 16 ? `${tag.slice(0, 16)}…` : tag;
}

function bucketLabel(bucket: FindingBucket): string {
  if (bucket === "app") return "App";
  if (bucket === "residual") return "Residual";
  if (bucket === "os") return "OS";
  return "—";
}

function bucketClass(bucket: FindingBucket): string {
  if (bucket === "app") return "text-amber-300";
  if (bucket === "residual") return "text-zinc-500";
  if (bucket === "os") return "text-sky-300";
  return "text-zinc-600";
}

export function DockerInventoryPanel({
  groups,
  checkMode,
  scansByImage: initialScans,
  serverId,
  coolifyRedeployReady = false,
}: Props) {
  const router = useRouter();
  const [scansByImage, setScansByImage] = useState(initialScans);
  const [activeScan, setActiveScan] = useState<string | null>(null);
  const [activeRedeploy, setActiveRedeploy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusByRow, setStatusByRow] = useState<Record<string, RowStatus>>(
    {},
  );
  const [pending, startTransition] = useTransition();

  function setStatus(key: string, status: RowStatus | null) {
    setStatusByRow((prev) => {
      if (!status) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: status };
    });
  }

  function toggleExpand(name: string) {
    setExpanded((e) => (e === name ? null : name));
  }

  function runScan(
    containerName: string,
    imageRef: string,
    force = false,
    coolifyUuid?: string,
  ) {
    setActiveScan(containerName);
    setStatus(containerName, null);
    startTransition(async () => {
      const result = await runContainerTrivyScan(
        containerName,
        imageRef,
        force,
        serverId,
        coolifyUuid,
      );
      setActiveScan(null);
      if (!result.ok) {
        setStatus(containerName, { kind: "error", text: result.message });
        setExpanded(containerName);
        router.refresh();
        return;
      }
      setScansByImage((prev) => ({
        ...prev,
        [imageRef]: result.record,
        [result.record.imageRef]: result.record,
        [result.record.imageDigest]: result.record,
      }));
      const liveKey = result.record.containerName;
      const plan = buildRemediationPlan(result.record.findings);
      const bits = [
        result.cached ? "Cache" : "Scan ok",
        `${result.record.durationMs}ms`,
        `CRIT ${result.record.criticalCount}`,
        `HIGH ${result.record.highCount}`,
      ];
      if (result.remappedFrom) bits.push("Name aktualisiert");
      setStatus(liveKey, {
        kind: "ok",
        text: bits.join(" · "),
      });
      if (liveKey !== containerName) setStatus(containerName, null);
      setExpanded(liveKey);
      // Keep primary action in status only via detail panel, not prose dump.
      void plan;
      router.refresh();
    });
  }

  function runRedeploy(containerName: string, coolifyUuid: string) {
    setActiveRedeploy(containerName);
    setStatus(containerName, null);
    startTransition(async () => {
      const result = await triggerCoolifyRedeployAction(coolifyUuid, serverId);
      setActiveRedeploy(null);
      setStatus(containerName, {
        kind: result.ok ? "info" : "error",
        text: result.ok
          ? "Deploy gestartet — hilft nur mit neuem Image (Lockfile-Commit). Dann Scan Neu."
          : result.message,
      });
      setExpanded(containerName);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.category} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {group.label}
            <span className="ml-2 font-normal normal-case text-zinc-600">
              {group.rows.length}
            </span>
          </h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-zinc-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">App</th>
                  <th className="px-3 py-2 font-medium hidden md:table-cell">
                    Container
                  </th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Trivy</th>
                  <th className="px-3 py-2 font-medium text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => {
                  const scan =
                    scansByImage[row.image] ??
                    Object.values(scansByImage).find(
                      (s) => s.containerName === row.name,
                    );
                  const isScanning = pending && activeScan === row.name;
                  const isRedeploying =
                    pending && activeRedeploy === row.name;
                  const canScan =
                    row.state === "running" || Boolean(row.coolifyUuid);
                  const canRedeploy =
                    coolifyRedeployReady &&
                    Boolean(row.coolifyUuid) &&
                    row.coolifyType !== "database";
                  const plan =
                    scan && (scan.criticalCount > 0 || scan.highCount > 0)
                      ? buildRemediationPlan(scan.findings)
                      : null;
                  const grouped = scan
                    ? groupFindingsByCve(scan.findings)
                    : [];
                  const residualN = grouped.filter(
                    (g) => g.bucket === "residual",
                  ).length;
                  const appN = grouped.filter((g) => g.bucket === "app").length;
                  const isOpen = expanded === row.name;
                  const status = statusByRow[row.name];

                  return (
                    <Fragment key={row.name}>
                      <tr
                        className={`border-t border-zinc-800/80 ${
                          isOpen ? "bg-zinc-900/40" : ""
                        }`}
                      >
                        <td className="px-3 py-2 text-zinc-100 align-top">
                          <button
                            type="button"
                            className="text-left hover:text-white disabled:opacity-60"
                            disabled={!scan && !status}
                            onClick={() => toggleExpand(row.name)}
                          >
                            {row.displayName}
                          </button>
                          {row.fqdn && (
                            <span className="block text-xs text-zinc-500 truncate max-w-[220px]">
                              {row.fqdn}
                            </span>
                          )}
                          {row.foreignImage && (
                            <Badge variant="critical" className="mt-1">
                              fremd
                            </Badge>
                          )}
                        </td>
                        <td
                          className="px-3 py-2 font-mono text-xs text-zinc-500 max-w-[120px] truncate hidden md:table-cell align-top"
                          title={row.name}
                        >
                          {row.name}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Badge
                            variant={
                              row.state === "running"
                                ? "healthy"
                                : row.state === "exited"
                                  ? "warning"
                                  : "critical"
                            }
                          >
                            {row.state}
                          </Badge>
                          <span
                            className="block text-[10px] text-zinc-600 mt-1 font-mono"
                            title={row.image}
                          >
                            {shortDigest(row.image)}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          {scan ? (
                            <button
                              type="button"
                              className="text-left space-y-1"
                              onClick={() => toggleExpand(row.name)}
                              aria-expanded={isOpen}
                            >
                              {scan.criticalCount > 0 ? (
                                <Badge variant="critical">
                                  {scan.criticalCount} crit
                                  {scan.highCount > 0
                                    ? ` / ${scan.highCount} high`
                                    : ""}
                                </Badge>
                              ) : scan.highCount > 0 ? (
                                <Badge variant="warning">
                                  {scan.highCount} high
                                </Badge>
                              ) : (
                                <Badge variant="healthy">clean</Badge>
                              )}
                              <span className="flex flex-wrap gap-1">
                                {appN > 0 && (
                                  <span className="text-[10px] text-amber-400">
                                    {appN} App
                                  </span>
                                )}
                                {residualN > 0 && (
                                  <span className="text-[10px] text-zinc-500">
                                    {residualN} Residual
                                  </span>
                                )}
                                {isOpen ? (
                                  <span className="text-[10px] text-zinc-400">
                                    zuklappen
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-zinc-600">
                                    Details
                                  </span>
                                )}
                              </span>
                            </button>
                          ) : canScan ? (
                            <Badge variant="warning">offen</Badge>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-wrap gap-1 justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!canScan || isScanning}
                              onClick={() =>
                                runScan(
                                  row.name,
                                  row.image,
                                  false,
                                  row.coolifyUuid,
                                )
                              }
                            >
                              {isScanning ? "…" : "Scan"}
                            </Button>
                            {scan && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={!canScan || isScanning}
                                onClick={() =>
                                  runScan(
                                    row.name,
                                    row.image,
                                    true,
                                    row.coolifyUuid,
                                  )
                                }
                              >
                                Neu
                              </Button>
                            )}
                            {canRedeploy && row.coolifyUuid && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={
                                  isRedeploying ||
                                  isScanning ||
                                  (plan != null &&
                                    !plan.redeployHelpsAlone &&
                                    plan.kind === "os_packages")
                                }
                                title={
                                  plan != null &&
                                  !plan.redeployHelpsAlone &&
                                  plan.kind === "os_packages"
                                    ? "Nur Residual — Rebuild bringt nichts"
                                    : plan != null &&
                                        (plan.kind === "app_deps" ||
                                          plan.kind === "mixed")
                                      ? "Zuerst App-Deps + Lockfile committen, dann Deploy"
                                      : "Force-Rebuild ohne Cache"
                                }
                                onClick={() =>
                                  runRedeploy(row.name, row.coolifyUuid!)
                                }
                              >
                                {isRedeploying
                                  ? "…"
                                  : plan != null &&
                                      (plan.kind === "app_deps" ||
                                        plan.kind === "mixed")
                                    ? "Deploy"
                                    : "Rebuild"}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-zinc-800/40 bg-zinc-950/80">
                          <td colSpan={5} className="px-3 py-3">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="min-w-0 space-y-1">
                                {status && (
                                  <p
                                    className={
                                      status.kind === "error"
                                        ? "text-xs text-red-300"
                                        : status.kind === "info"
                                          ? "text-xs text-sky-300"
                                          : "text-xs text-zinc-400"
                                    }
                                  >
                                    {status.text}
                                  </p>
                                )}
                                {plan && (
                                  <p className="text-xs text-zinc-300">
                                    <span className="text-zinc-500">Nächster Schritt: </span>
                                    {primaryActionLabel(plan)}
                                  </p>
                                )}
                                {scan && (
                                  <p className="text-[10px] text-zinc-600">
                                    Scan{" "}
                                    {new Date(scan.scannedAt).toLocaleString(
                                      "de-DE",
                                    )}
                                    {" · "}
                                    {shortDigest(scan.imageDigest)}
                                  </p>
                                )}
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setExpanded(null)}
                              >
                                Schließen
                              </Button>
                            </div>

                            {grouped.length > 0 ? (
                              <div className="overflow-x-auto rounded border border-zinc-800/80">
                                <table className="w-full text-xs">
                                  <thead className="text-zinc-500 text-left bg-zinc-900/60">
                                    <tr>
                                      <th className="px-2 py-1.5 w-16">Sev</th>
                                      <th className="px-2 py-1.5 w-36">CVE</th>
                                      <th className="px-2 py-1.5">Pakete</th>
                                      <th className="px-2 py-1.5 w-20">Art</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {grouped.map((g) => (
                                      <tr
                                        key={`${g.severity}-${g.vulnerabilityId}`}
                                        className="border-t border-zinc-800/60"
                                      >
                                        <td
                                          className={`px-2 py-1.5 font-medium ${
                                            g.severity === "CRITICAL"
                                              ? "text-red-400"
                                              : "text-amber-400"
                                          }`}
                                        >
                                          {g.severity === "CRITICAL"
                                            ? "CRIT"
                                            : "HIGH"}
                                        </td>
                                        <td className="px-2 py-1.5 font-mono text-zinc-300 whitespace-nowrap">
                                          {g.vulnerabilityId}
                                        </td>
                                        <td
                                          className="px-2 py-1.5 text-zinc-400"
                                          title={g.title}
                                        >
                                          {g.packages.length > 0
                                            ? g.packages.length <= 3
                                              ? g.packages.join(", ")
                                              : `${g.packages.slice(0, 2).join(", ")} +${g.packages.length - 2}`
                                            : "—"}
                                        </td>
                                        <td
                                          className={`px-2 py-1.5 ${bucketClass(g.bucket)}`}
                                        >
                                          {bucketLabel(g.bucket)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : scan ? (
                              <p className="text-xs text-emerald-400/90">
                                Keine HIGH/CRITICAL Findings.
                              </p>
                            ) : status?.kind === "error" ? null : (
                              <p className="text-xs text-zinc-500">
                                Noch kein Scan.
                              </p>
                            )}

                            {checkMode === "mock" && (
                              <p className="mt-2 text-[10px] text-zinc-600">
                                Mock-Modus
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
