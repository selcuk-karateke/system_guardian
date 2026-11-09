import { NextRequest, NextResponse } from "next/server";
import {
  alertsFromAgentLive,
  isAgentEgressAlertMessage,
  parseAgentIngestPayload,
  persistAgentIngest,
} from "@/lib/agent/ingest";
import { resolveServerByAgentToken } from "@/lib/agent/token";
import {
  processAlerts,
  reconcileAgentEgressAlerts,
} from "@/lib/alerts/pipeline";

export const runtime = "nodejs";

function bearerToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
}

export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const server = await resolveServerByAgentToken(token);
  if (!server) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = parseAgentIngestPayload(body);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Optional: agent may send claimed serverId — must match token binding
  const claimed =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).serverId
      : null;
  if (typeof claimed === "string" && claimed && claimed !== server.id) {
    return NextResponse.json({ error: "serverId mismatch" }, { status: 403 });
  }

  const live = await persistAgentIngest(server.id, payload);
  const alerts = alertsFromAgentLive(live);
  if (alerts.length) {
    await processAlerts(server.id, "server_health", alerts);
  }
  // Always reconcile: closes Mbps-spam / LAN false-positives when quiet.
  await reconcileAgentEgressAlerts(
    server.id,
    alerts,
    isAgentEgressAlertMessage,
  );

  return NextResponse.json({
    ok: true,
    serverId: server.id,
    alerts: alerts.length,
    receivedAt: live.receivedAt,
  });
}
