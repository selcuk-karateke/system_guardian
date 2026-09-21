import { NextRequest, NextResponse } from "next/server";
import {
  getAlertsInRange,
  getChangeEventsInRange,
  getCheckRunsInRange,
  getPointInTimeChecks,
} from "@/lib/history/timeline";

export async function GET(req: NextRequest) {
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const module = req.nextUrl.searchParams.get("module") ?? undefined;
  const mode = req.nextUrl.searchParams.get("mode") ?? "range";

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam
    ? new Date(fromParam)
    : new Date(to.getTime() - 7 * 86400000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid from/to" }, { status: 400 });
  }

  const filters = { from, to, module };

  if (mode === "point") {
    const point = await getPointInTimeChecks(to);
    return NextResponse.json({ mode, at: to.toISOString(), checks: point });
  }

  const [checks, changes, alerts] = await Promise.all([
    getCheckRunsInRange(filters),
    getChangeEventsInRange(filters),
    getAlertsInRange(filters),
  ]);

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    module,
    checks,
    changes,
    alerts,
  });
}
