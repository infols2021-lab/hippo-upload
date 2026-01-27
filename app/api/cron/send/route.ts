import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCronCall(req: Request) {
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const uaOk = ua.includes("vercel-cron/");

  const secret = String(process.env.CRON_SECRET || "").trim();
  const auth = req.headers.get("authorization") || "";
  const authOk = !!secret && (auth === secret || auth === `Bearer ${secret}` || auth === `bearer ${secret}`);

  const xCronOk = req.headers.has("x-vercel-cron");
  return { ok: uaOk || authOk || xCronOk, uaOk, authOk, xCronOk };
}

export async function GET(req: Request) {
  try {
    const check = isCronCall(req);
    if (!check.ok) {
      return NextResponse.json({ ok: false, message: "Forbidden (not a cron call)" }, { status: 403 });
    }

    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret) {
      return NextResponse.json({ ok: false, message: "CRON_SECRET not set" }, { status: 500 });
    }

    const url = new URL(req.url);
    const origin = url.origin;

    const regionOrder = ["kur", "orl", "bel", "vor", "tam", "nnov", "lip", "my"];

    console.log("🕔 CRON SEND START", new Date().toISOString(), check);

    async function callBatch(mode: "retry_errors" | "unsent") {
      const r = await fetch(`${origin}/api/admin/batch-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-token": secret,
          "Authorization": `Bearer ${secret}`,
        },
        body: JSON.stringify({ mode, regionOrder, limit: 120 }),
      });

      const body = await r.json().catch(() => null);

      if (!r.ok) {
        console.log("❌ BATCH FAIL", mode, r.status, body);
      } else {
        console.log("✅ BATCH OK", mode, r.status);
      }

      return { status: r.status, body };
    }

    const retry = await callBatch("retry_errors");
    const unsent = await callBatch("unsent");

    console.log("✅ CRON DONE", { retryStatus: retry.status, unsentStatus: unsent.status });

    return NextResponse.json({
      ok: true,
      message: "Cron отправка выполнена",
      retry,
      unsent,
    });
  } catch (e: any) {
    console.error("❌ CRON ERROR", e?.stack || e);
    return NextResponse.json({ ok: false, message: "Server error: " + String(e?.message || e) }, { status: 500 });
  }
}
