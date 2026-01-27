import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron будет вызывать /api/cron/send и добавлять заголовок x-vercel-cron: 1
export async function GET(req: Request) {
  try {
    const isCron = req.headers.get("x-vercel-cron") === "1";
    if (!isCron) {
      return NextResponse.json({ ok: false, message: "Forbidden (not a cron call)" }, { status: 403 });
    }

    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret) {
      return NextResponse.json({ ok: false, message: "CRON_SECRET not set" }, { status: 500 });
    }

    const url = new URL(req.url);
    const origin = url.origin;

    const regionOrder = ["kur", "orl", "bel", "vor", "tam", "nnov", "lip", "my"];

    console.log("🕔 CRON SEND START", new Date().toISOString());

    // 1) ретрай ошибок
    const retry = await fetch(`${origin}/api/admin/batch-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-token": secret, // batch-send принимает x-cron-token
      },
      body: JSON.stringify({
        mode: "retry_errors",
        regionOrder,
        limit: 120,
      }),
    });

    const retryJson = await retry.json().catch(() => null);

    // 2) потом обычные неотправленные
    const unsent = await fetch(`${origin}/api/admin/batch-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-token": secret,
      },
      body: JSON.stringify({
        mode: "unsent",
        regionOrder,
        limit: 120,
      }),
    });

    const unsentJson = await unsent.json().catch(() => null);

    console.log("✅ CRON DONE", {
      retryStatus: retry.status,
      unsentStatus: unsent.status,
    });

    return NextResponse.json({
      ok: true,
      message: "Cron отправка выполнена",
      retry: { status: retry.status, body: retryJson },
      unsent: { status: unsent.status, body: unsentJson },
    });
  } catch (e: any) {
    console.error("❌ CRON ERROR", e?.stack || e);
    return NextResponse.json({ ok: false, message: "Server error: " + String(e?.message || e) }, { status: 500 });
  }
}
