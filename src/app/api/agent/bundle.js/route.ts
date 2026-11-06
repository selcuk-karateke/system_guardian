import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Serves the host agent script for install.sh. */
export async function GET() {
  const path = join(
    /* turbopackIgnore: true */ process.cwd(),
    "agent",
    "guardian-agent.mjs",
  );
  try {
    const body = await readFile(path, "utf8");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "agent bundle missing" },
      { status: 404 },
    );
  }
}
