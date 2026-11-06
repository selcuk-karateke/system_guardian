import { NextRequest, NextResponse } from "next/server";
import {
  getFreshAgentLive,
  toMonitorLivePayload,
} from "@/lib/agent/ingest";
import { AGENT_FRESH_MS } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fresh agent snapshot for monitor Load/RAM/Disk + egress/talker.
 * Short-lived JSON for client poll (~5s in Live mode).
 */
export async function GET(req: NextRequest) {
  const serverId = req.nextUrl.searchParams.get("serverId")?.trim();
  if (!serverId) {
    return NextResponse.json(
      { ok: false, error: "serverId required" },
      { status: 400 },
    );
  }

  const live = await getFreshAgentLive(serverId, AGENT_FRESH_MS);
  return NextResponse.json(toMonitorLivePayload(live));
}
