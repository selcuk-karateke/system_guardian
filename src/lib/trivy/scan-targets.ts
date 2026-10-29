/**
 * Containers the batch/cron Trivy path skips (infra noise).
 * Unscanned badges must use the same filter — otherwise the number never hits 0.
 */
export function isTrivyBatchTarget(containerName: string): boolean {
  return !/coolify-proxy|coolify-db|coolify-redis|coolify-realtime|coolify-sentinel|coolify-proxy-error|traefik|^redis-/i.test(
    containerName,
  );
}
