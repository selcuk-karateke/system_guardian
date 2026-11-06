import { NextRequest, NextResponse } from "next/server";
import {
  formatTopTalkerLine,
  getFreshAgentLive,
} from "@/lib/agent/ingest";
import { AGENT_FRESH_MS } from "@/lib/agent/types";

/**
 * Lightweight poll for monitor status band — egress + top talker only.
 * Session cookie when auth is on (not under public /api/agent/).
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
  if (!live?.egress) {
    return NextResponse.json({
      ok: true,
      online: Boolean(live),
      agentVersion: live?.agentVersion ?? null,
      receivedAt: live?.receivedAt ?? null,
      egress: null,
    });
  }

  const topTalker = formatTopTalkerLine(live.talkers);
  const top = [...live.talkers].sort((a, b) => b.txBps - a.txBps)[0];
  return NextResponse.json({
    ok: true,
    online: true,
    agentVersion: live.agentVersion,
    receivedAt: live.receivedAt,
    egress: {
      txMbps: live.egress.txMbps,
      // Process write-bytes in sample window (not full NIC counter)
      txBytes: top?.txBytes ?? null,
      windowSec: live.egress.windowSec,
      iface: live.egress.iface,
      topTalker,
    },
  });
}
