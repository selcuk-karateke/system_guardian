import {
  getNotificationPublicStatus,
  type NotificationPublicStatus,
} from "./config";

export type NotificationChannelStatus = NotificationPublicStatus;

/**
 * @deprecated Prefer getNotificationPublicStatus (async, DB-backed).
 * Sync stub — notifications live in Settings DB, not ENV.
 */
export function getNotificationChannelStatus(): {
  telegram: boolean;
  discord: boolean;
  email: boolean;
} {
  return { telegram: false, discord: false, email: false };
}

export { getNotificationPublicStatus };
