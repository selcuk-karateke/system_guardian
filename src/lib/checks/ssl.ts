import * as tls from "tls";
import { db } from "@/db";
import { monitoredDomains } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { AlertInput, CheckResult } from "./types";

function checkCert(host: string, port = 443): Promise<{
  daysLeft: number;
  valid: boolean;
}> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host, port, servername: host, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert.valid_to) {
          resolve({ daysLeft: 0, valid: false });
          return;
        }
        const expiry = new Date(cert.valid_to).getTime();
        const daysLeft = Math.floor((expiry - Date.now()) / 86400000);
        resolve({ daysLeft, valid: daysLeft > 0 });
      },
    );
    socket.on("error", () => resolve({ daysLeft: 0, valid: false }));
    socket.setTimeout(10000, () => {
      socket.destroy();
      resolve({ daysLeft: 0, valid: false });
    });
  });
}

export async function runSslCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const domains = await db
    .select()
    .from(monitoredDomains)
    .where(eq(monitoredDomains.isActive, true));

  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const certs: Record<string, { daysLeft: number; valid: boolean }> = {};

  for (const d of domains) {
    const result = await checkCert(d.domain);
    certs[d.domain] = result;

    if (!result.valid) {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `SSL expired or missing for ${d.domain}`,
        recommendation: "Renew certificate via Coolify or certbot",
      });
    } else if (result.daysLeft < 7) {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `SSL for ${d.domain} expires in ${result.daysLeft} days`,
      });
    } else if (result.daysLeft < 14) {
      if (status !== "critical") status = "warning";
      alerts.push({
        level: "warning",
        message: `SSL for ${d.domain} expires in ${result.daysLeft} days`,
      });
    } else if (result.daysLeft < 30) {
      if (status === "healthy") status = "warning";
      alerts.push({
        level: "warning",
        message: `SSL for ${d.domain} expires in ${result.daysLeft} days`,
      });
    }
  }

  return {
    module: "ssl",
    status,
    data: { certificates: certs },
    alerts,
  };
}
