import { NextRequest, NextResponse } from "next/server";
import { verifyApiAuth } from "@/lib/api-auth";
import { isApiEnabled } from "@/lib/auth/config";
import { getGlobalStatus, getLastCheckTime } from "@/lib/dashboard-data";

/** Read-only status for Discord bot / integrations. Bearer API_SECRET */
export async function GET(request: NextRequest) {
  if (!isApiEnabled()) {
    return NextResponse.json({ error: "API not configured" }, { status: 503 });
  }
  if (!verifyApiAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [status, lastCheck] = await Promise.all([
      getGlobalStatus(),
      getLastCheckTime(),
    ]);
    return NextResponse.json({
      ok: true,
      status,
      lastCheck: lastCheck?.toISOString() ?? null,
      checkMode: process.env.CHECK_MODE ?? "mock",
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
