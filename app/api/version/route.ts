import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: "2026-01-17-no-tolowercase-1",
  });
}
