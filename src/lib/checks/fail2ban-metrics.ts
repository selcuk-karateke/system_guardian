/** Mindest-Delta und Rate — wichtig bei manueller Auslösung (lange Intervalle). */
export const BAN_SPIKE_MIN_DELTA = 100;
export const BAN_SPIKE_MIN_RATE_PER_HOUR = 40;

export function hoursSinceSnapshot(previousAt: Date | null): number {
  if (!previousAt) return 1;
  const ms = Date.now() - previousAt.getTime();
  return Math.max(ms / 3_600_000, 5 / 60);
}

export function formatSinceLastCheck(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} Min.`;
  if (hours < 48) return `${hours < 2 ? hours.toFixed(1) : Math.round(hours)} Std.`;
  const days = Math.round(hours / 24);
  return `${days} Tag${days === 1 ? "" : "e"}`;
}

export function isBanSpike(
  prevTotal: number,
  currTotal: number,
  hoursSince: number,
): { spike: boolean; delta: number; ratePerHour: number } {
  const delta = currTotal - prevTotal;
  const ratePerHour = delta / hoursSince;
  const spike =
    delta > BAN_SPIKE_MIN_DELTA && ratePerHour >= BAN_SPIKE_MIN_RATE_PER_HOUR;
  return { spike, delta, ratePerHour };
}
