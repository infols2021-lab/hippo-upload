import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(ok: boolean, message: string, status = 200, extra?: any) {
  return NextResponse.json({ ok, message, ...(extra || {}) }, { status });
}

function isCronCall(req: Request) {
  // 1) Самый надёжный сигнал в твоих логах: user-agent = vercel-cron/1.0
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const uaOk = ua.includes("vercel-cron/");

  // 2) Альтернатива: CRON_SECRET через Authorization header (если Vercel его шлёт)
  // Vercel docs: значение CRON_SECRET может быть отправлено в Authorization header при cron invocations.
  const secret = String(process.env.CRON_SECRET || "").trim();
  const auth = req.headers.get("authorization") || "";
  const authOk =
    !!secret &&
    (auth === secret ||
      auth === `Bearer ${secret}` ||
      auth === `bearer ${secret}`);

  // 3) Если вдруг у кого-то есть x-vercel-cron — тоже принимаем
  const xCronOk = req.headers.has("x-vercel-cron");

  return { ok: uaOk || authOk || xCronOk, uaOk, authOk, xCronOk };
}

export async function GET(req: Request) {
  try {
    const check = isCronCall(req);
    if (!check.ok) {
      // Безопасная диагностика (без вывода секретов)
      return json(false, "Forbidden (not a cron call)", 403, {
        debug: {
          ua: req.headers.get("user-agent") || "",
          hasXVercelCron: req.headers.has("x-vercel-cron"),
          hasAuth: !!req.headers.get("authorization"),
        },
      });
    }

    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret) {
      return json(false, "CRON_SECRET not set", 500);
    }

    const url = new URL(req.url);
    const origin = url.origin;

    const regionOrder = ["kur", "orl", "bel", "vor", "tam", "nnov", "lip", "my"];

    console.log("🕔 CRON SEND START", new Date().toISOString(), {
      uaOk: check.uaOk,
      authOk: check.authOk,
      xCronOk: check.xCronOk,
    });

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
    return json(false, "Server error: " + String(e?.message || e), 500);
  }
}
