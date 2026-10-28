export type TrivyFinding = {
  vulnerabilityId: string;
  severity: string;
  title: string;
  pkgName?: string;
};

export type TrivyScanRecord = {
  imageRef: string;
  imageDigest: string;
  containerName: string;
  scannedAt: string;
  highCount: number;
  criticalCount: number;
  findings: TrivyFinding[];
  durationMs: number;
};

export type TrivyScanResult =
  | {
      ok: true;
      record: TrivyScanRecord;
      cached: boolean;
      /** Stale Coolify name after Dockerfile rebuild was remapped to live container. */
      remappedFrom?: string;
    }
  | { ok: false; message: string };
