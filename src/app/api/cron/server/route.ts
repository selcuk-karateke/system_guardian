import { NextRequest, NextResponse } from "next/server";
import { runServerCheckBatch } from "@/lib/checks";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getDefaultServerId } from "@/lib/servers";

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const serverId = await getDefaultServerId();
    const results = await runServerCheckBatch(serverId);
    return NextResponse.json({
      ok: true,
      ran: results.length,
      modules: results.map((r) => ({ module: r.module, status: r.status })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Check failed" },
      { status: 500 },
    );
  }
}
