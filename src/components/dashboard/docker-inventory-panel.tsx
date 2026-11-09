"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { runContainerTrivyScan } from "@/app/actions/docker-trivy";
import { triggerCoolifyRedeployAction } from "@/app/actions/protect";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { wakeBackgroundJobsOverlay } from "@/lib/jobs/wake-client";
import { notifyProgress, notifyResult } from "@/lib/ui/notify";
import type { DockerInventoryGroup } from "@/lib/docker/inventory";
import {
  findScanForContainer,
  uniqueScanRecords,
} from "@/lib/trivy/match-scan";
import {
  appFindingCounts,
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

function shortContainerName(name: string): string {
  const m = name.match(/^([a-z0-9]{10,})-\d{8,}/i);
  if (m) return `${m[1].slice(0, 12)}…`;
  return name.length > 18 ? `${name.slice(0, 16)}…` : name;
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
  const [scansByImage, setScansByImage] = useState(initialScans);
  const [activeScan, setActiveScan] = useState<string | null>(null);
  const [activeRedeploy, setActiveRedeploy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusByRow, setStatusByRow] = useState<Record<string, RowStatus>>(
    {},
  );
  const [pending, startTransition] = useTransition();

  // Overlay refresh / page props update → keep local scan map in sync.
  useEffect(() => {
    setScansByImage(initialScans);
  }, [initialScans]);

  const scanList = uniqueScanRecords(scansByImage);

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
    const toastId = `trivy:${containerName}`;
    notifyProgress(toastId, `Trivy-Scan · ${containerName}…`);
    startTransition(async () => {
      try {
        const result = await runContainerTrivyScan(
          containerName,
          imageRef,
          force,
          serverId,
          coolifyUuid,
        );
        setActiveScan(null);
        notifyResult(result, { id: toastId });
        if (!result.ok) {
          setStatus(containerName, { kind: "error", text: result.message });
          setExpanded(containerName);
          return;
        }
        setStatus(containerName, {
          kind: "info",
          text: result.message,
        });
        setExpanded(containerName);
        wakeBackgroundJobsOverlay({
          label: "Trivy-Scan",
          detail: containerName,
        });
      } catch (e) {
        setActiveScan(null);
        const message =
          e instanceof Error
            ? e.message.slice(0, 200)
            : "Scan-Anfrage fehlgeschlagen";
        notifyResult({ ok: false, message }, { id: toastId });
        setStatus(containerName, { kind: "error", text: message });
        setExpanded(containerName);
      }
    });
  }

  function runRedeploy(containerName: string, coolifyUuid: string) {
    setActiveRedeploy(containerName);
    setStatus(containerName, null);
    const toastId = `redeploy:${containerName}`;
    notifyProgress(toastId, `Redeploy · ${containerName}…`);
    startTransition(async () => {
      try {
        const result = await triggerCoolifyRedeployAction(coolifyUuid, serverId);
        setActiveRedeploy(null);
        notifyResult(result, { id: toastId });
        setStatus(containerName, {
          kind: result.ok ? "info" : "error",
          text: result.message,
        });
        setExpanded(containerName);
        if (result.ok) {
          wakeBackgroundJobsOverlay({
            label: "Coolify Redeploy",
            detail: containerName,
          });
        }
      } catch (e) {
        setActiveRedeploy(null);
        const message =
          e instanceof Error
            ? e.message.slice(0, 200)
            : "Redeploy-Anfrage fehlgeschlagen";
        notifyResult({ ok: false, message }, { id: toastId });
        setStatus(containerName, { kind: "error", text: message });
        setExpanded(containerName);
      }
    });
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <CollapsibleSection
          key={group.category}
          id={group.category}
          title={group.label}
          count={group.rows.length}
          defaultOpen={group.category === "app" || group.rows.length <= 8}
        >
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-zinc-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">App</th>
                  <th className="px-3 py-2 font-medium hidden lg:table-cell">
                    Container
                  </th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Trivy</th>
                  <th className="px-3 py-2 font-medium text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => {
                  const scan = findScanForContainer(scanList, {
                    name: row.name,
                    image: row.image,
                    coolifyUuid: row.coolifyUuid,
                  });
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
                    (g) => g.bucket === "residual" || g.bucket === "os",
                  ).length;
                  const appN = grouped.filter((g) => g.bucket === "app").length;
                  const appCounts = scan
                    ? appFindingCounts(scan.findings)
                    : { critical: 0, high: 0 };
                  const isOpen = expanded === row.name;
                  const status = statusByRow[row.name];
                  const fqdnShown =
                    row.fqdn &&
                    !row.displayName.toLowerCase().includes(row.fqdn.toLowerCase());

                  return (
                    <Fragment key={row.name}>
                      <tr
                        className={`border-t border-zinc-800/80 ${
                          isOpen ? "bg-zinc-900/40" : ""
                        }`}
                      >
                        <td className="px-3 py-2 text-zinc-100 align-middle">
                          <button
                            type="button"
                            className="text-left font-medium hover:text-white disabled:opacity-60"
                            disabled={!scan && !status}
                            onClick={() => toggleExpand(row.name)}
                          >
                            {row.displayName}
                          </button>
                          {fqdnShown && (
                            <span
                              className="mt-0.5 block max-w-[240px] truncate text-xs text-zinc-500"
                              title={row.fqdn}
                            >
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
                          className="hidden max-w-[100px] truncate px-3 py-2 align-middle font-mono text-xs text-zinc-500 lg:table-cell"
                          title={row.name}
                        >
                          {shortContainerName(row.name)}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <Badge
                            variant={
                              row.state === "running"
                                ? "healthy"
                                : row.state === "exited"
                                  ? "warning"
                                  : "critical"
                            }
                            title={row.image}
                          >
                            {row.state}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {scan ? (
                            <button
                              type="button"
                              className="space-y-0.5 text-left"
                              onClick={() => toggleExpand(row.name)}
                              aria-expanded={isOpen}
                            >
                              {appCounts.critical > 0 ? (
                                <Badge variant="critical">
                                  {appCounts.critical} App-crit
                                  {appCounts.high > 0
                                    ? ` / ${appCounts.high} high`
                                    : ""}
                                </Badge>
                              ) : appCounts.high > 0 ? (
                                <Badge variant="warning">
                                  {appCounts.high} App-high
                                </Badge>
                              ) : scan.criticalCount > 0 ||
                                scan.highCount > 0 ? (
                                <Badge
                                  variant="healthy"
                                  title="Nur OS/Residual — kein App-Dep"
                                  className="border-zinc-700 bg-zinc-900/80 text-zinc-400"
                                >
                                  nur OS
                                  {scan.criticalCount + scan.highCount > 0
                                    ? ` (${scan.criticalCount + scan.highCount})`
                                    : ""}
                                </Badge>
                              ) : (
                                <Badge variant="healthy">clean</Badge>
                              )}
                              {(appN > 0 || residualN > 0) && (
                                <span className="flex flex-wrap gap-1.5 text-[10px] text-zinc-500">
                                  {appN > 0 && (
                                    <span className="text-amber-400/90">
                                      {appN} App-CVE
                                    </span>
                                  )}
                                  {residualN > 0 && (
                                    <span className="text-zinc-600">
                                      {residualN} OS/Residual
                                    </span>
                                  )}
                                </span>
                              )}
                            </button>
                          ) : canScan ? (
                            <Badge variant="warning">nicht gescannt</Badge>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex flex-wrap justify-end gap-1">
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
                                <p
                                  className="truncate text-[10px] text-zinc-600"
                                  title={row.image}
                                >
                                  {row.name}
                                  {" · "}
                                  {shortDigest(row.image)}
                                  {scan
                                    ? ` · Scan ${new Date(scan.scannedAt).toLocaleString("de-DE")}`
                                    : ""}
                                </p>
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
        </CollapsibleSection>
      ))}
    </div>
  );
}
