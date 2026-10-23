import { NextRequest, NextResponse } from "next/server";
import { runServerCheckBatch } from "@/lib/checks";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getDefaultServerId, listActiveServers } from "@/lib/servers";

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rows = await listActiveServers();
    const ids =
      rows.length > 0 ? rows.map((r) => r.id) : [await getDefaultServerId()];
    const modules: { module: string; status: string; serverId: string }[] = [];
    for (const serverId of ids) {
      const results = await runServerCheckBatch(serverId);
      modules.push(
        ...results.map((r) => ({
          module: r.module,
          status: r.status,
          serverId,
        })),
      );
    }
    return NextResponse.json({
      ok: true,
      servers: ids.length,
      ran: modules.length,
      modules,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Check failed" },
      { status: 500 },
    );
  }
}
