import { NextResponse } from "next/server";
import { getLiveSky } from "@/lib/geo/live-sky";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live aircraft (OpenSky) + satellites (CelesTrak/SGP4) for the monitor globe.
 * Server-cached; client polls ~15s.
 */
export async function GET() {
  try {
    const sky = await getLiveSky();
    return NextResponse.json(sky, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sky failed";
    return NextResponse.json(
      {
        ok: false,
        at: new Date().toISOString(),
        flights: [],
        satellites: [],
        flightsSource: "unavailable",
        satellitesSource: "unavailable",
        error: message,
      },
      { status: 502 },
    );
  }
}
