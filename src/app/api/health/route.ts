import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "system_guardian",
    checkMode: process.env.CHECK_MODE ?? "mock",
  });
}
