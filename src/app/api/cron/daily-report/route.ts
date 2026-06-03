import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { generateAndSendDailyReport } from "@/lib/daily-report";
import { getDefaultServerId } from "@/lib/servers";

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const serverId = await getDefaultServerId();
    const result = await generateAndSendDailyReport(serverId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Report failed" },
      { status: 500 },
    );
  }
}
