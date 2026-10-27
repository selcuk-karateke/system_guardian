"use client";

import { Fragment, useState, useTransition } from "react";
import { runContainerTrivyScan } from "@/app/actions/docker-trivy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DockerInventoryGroup } from "@/lib/docker/inventory";
import type { TrivyScanRecord } from "@/lib/trivy/types";

type Props = {
  groups: DockerInventoryGroup[];
  checkMode: string;
  scansByImage: Record<string, TrivyScanRecord>;
  serverId?: string;
};

function shortDigest(image: string): string {
  if (image.startsWith("sha256:")) return image.slice(7, 19);
  const tag = image.split(":").pop() ?? image;
  return tag.length > 16 ? `${tag.slice(0, 16)}…` : tag;
}

export function DockerInventoryPanel({
  groups,
  checkMode,
  scansByImage: initialScans,
  serverId,
}: Props) {
  const [scansByImage, setScansByImage] = useState(initialScans);
  const [activeScan, setActiveScan] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function runScan(containerName: string, imageRef: string, force = false) {
    setActiveScan(containerName);
    setMessages((m) => ({ ...m, [containerName]: "" }));
    startTransition(async () => {
      const result = await runContainerTrivyScan(
        containerName,
        imageRef,
        force,
        serverId,
      );
      setActiveScan(null);
      if (!result.ok) {
        setMessages((m) => ({ ...m, [containerName]: result.message }));
        return;
      }
      setScansByImage((prev) => ({
        ...prev,
        [imageRef]: result.record,
        [result.record.imageDigest]: result.record,
      }));
      setExpanded(containerName);
      const prefix = result.cached ? "Cache" : "Scan ok";
      const alertNote =
        result.record.criticalCount > 0 || result.record.highCount > 0
          ? " · Warnung erzeugt"
          : "";
      setMessages((m) => ({
        ...m,
        [containerName]: `${prefix} · ${result.record.durationMs}ms · HIGH ${result.record.highCount} · CRIT ${result.record.criticalCount}${alertNote}`,
      }));
    });
  }

  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-400">
        <p>
          <strong className="text-zinc-200">{totalRows}</strong> Container in{" "}
          {groups.length} Gruppen. Trivy HIGH/CRITICAL → Dashboard-Warnungen.
          Zusätzlich Security-Cron (wenige Images/Stunde). Cache pro Digest.
        </p>
        <p className="mt-2 text-xs">
          Extern bei Verdacht:{" "}
          <a
            className="text-sky-400 underline"
            href="https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Cyber-Sicherheitslage/Reaktion/CERT-Bund-Abteilung/cert-bund_node.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            BSI CERT-Bund
          </a>
          {" · "}
          <a
            className="text-sky-400 underline"
            href="https://status.hetzner.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Hetzner Status
          </a>
        </p>
      </div>

      {groups.map((group) => (
        <section key={group.category} className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-200">
            {group.label}
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({group.rows.length})
            </span>
          </h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-zinc-500 text-left">
                <tr>
                  <th className="px-3 py-2">Anwendung</th>
                  <th className="px-3 py-2">Container</th>
                  <th className="px-3 py-2">Image</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Trivy</th>
                  <th className="px-3 py-2 w-36" />
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
                  const canScan = row.state === "running";

                  return (
                    <Fragment key={row.name}>
                      <tr className="border-t border-zinc-800/80">
                        <td className="px-3 py-2 text-zinc-100">
                          {row.displayName}
                          {row.fqdn && (
                            <span className="block text-xs text-zinc-500">
                              {row.fqdn}
                              {row.environmentName
                                ? ` · ${row.environmentName}`
                                : ""}
                            </span>
                          )}
                          {row.foreignImage && (
                            <Badge variant="critical" className="mt-1">
                              fremd
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-zinc-500 max-w-[140px] truncate">
                          {row.name}
                        </td>
                        <td
                          className="px-3 py-2 text-zinc-400 max-w-[200px] truncate"
                          title={row.image}
                        >
                          {shortDigest(row.image)}
                        </td>
                        <td className="px-3 py-2">
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
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-400">
                          {scan ? (
                            <span>
                              {scan.criticalCount > 0 && (
                                <span className="text-red-400">
                                  {scan.criticalCount} crit{" "}
                                </span>
                              )}
                              {scan.highCount > 0 && (
                                <span className="text-amber-400">
                                  {scan.highCount} high
                                </span>
                              )}
                              {scan.criticalCount === 0 &&
                                scan.highCount === 0 && (
                                  <span className="text-emerald-400">clean</span>
                                )}
                              <span className="block text-zinc-600">
                                {new Date(scan.scannedAt).toLocaleString(
                                  "de-DE",
                                )}
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1 justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!canScan || isScanning}
                              onClick={() => runScan(row.name, row.image)}
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
                                  runScan(row.name, row.image, true)
                                }
                              >
                                Neu
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {(expanded === row.name || messages[row.name]) && (
                        <tr className="border-t border-zinc-800/50 bg-zinc-900/30">
                          <td colSpan={6} className="px-3 py-2 text-xs">
                            {messages[row.name] && (
                              <p className="text-zinc-400 mb-2">
                                {messages[row.name]}
                              </p>
                            )}
                            {scan && scan.findings.length > 0 ? (
                              <ul className="space-y-1 text-zinc-300">
                                {scan.findings.map((f) => (
                                  <li key={`${f.vulnerabilityId}-${f.pkgName}`}>
                                    <span
                                      className={
                                        f.severity === "CRITICAL"
                                          ? "text-red-400"
                                          : "text-amber-400"
                                      }
                                    >
                                      {f.severity}
                                    </span>
                                    {": "}
                                    {f.vulnerabilityId}
                                    {f.pkgName ? ` (${f.pkgName})` : ""} —{" "}
                                    {f.title}
                                  </li>
                                ))}
                              </ul>
                            ) : scan ? (
                              <p className="text-emerald-400/90">
                                Keine HIGH/CRITICAL Findings.
                              </p>
                            ) : null}
                            {checkMode === "mock" && (
                              <p className="mt-1 text-zinc-600">
                                Mock-Modus: simulierte Scan-Daten.
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
