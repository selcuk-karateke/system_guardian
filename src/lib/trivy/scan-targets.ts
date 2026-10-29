/**
 * Containers the batch/cron Trivy path skips (infra noise).
 * Unscanned badges must use the same filter — otherwise the number never hits 0.
 */
export function isTrivyBatchTarget(containerName: string): boolean {
  // All Coolify platform containers + Traefik + anonymous redis sidecars
  return !/^(coolify|traefik|redis-)/i.test(containerName);
}
