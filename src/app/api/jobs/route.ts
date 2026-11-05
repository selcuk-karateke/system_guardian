import { NextResponse } from "next/server";
import { hasActiveJobs, listJobs } from "@/lib/jobs/store";

/** Dashboard poll — session cookie via middleware when auth is on. */
export async function GET() {
  const jobs = listJobs();
  return NextResponse.json({
    ok: true,
    active: hasActiveJobs(),
    jobs,
  });
}
