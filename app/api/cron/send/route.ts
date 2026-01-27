import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Вызов от Vercel Cron: /api/cron/send?token=CRON_SECRET
export async function GET(req: Request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  const url = new URL(req.url);

  const token = String(url.searchParams.get("token") || "");
  if (!secret) return NextResponse.json({ ok: false, message: "CRON_SECRET not set" }, { status: 500 });
  if (!token || token !== secret) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const origin = url.origin;

  // порядок регионов (меняй как хочешь)
  const regionOrder = ["kur", "orl", "bel", "vor", "tam", "nnov", "lip", "my"];

  // 1) Сначала ретрай ошибок
  const retry = await fetch(`${origin}/api/admin/batch-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-token": secret,
    },
    body: JSON.stringify({
      mode: "retry_errors",
      regionOrder,
      limit: 120,
    }),
  });

  // 2) Потом обычные неотправленные
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

  const retryJson = await retry.json().catch(() => null);
  const unsentJson = await unsent.json().catch(() => null);

  return NextResponse.json({
    ok: true,
    message: "Cron отправка выполнена",
    retry: { status: retry.status, body: retryJson },
    unsent: { status: unsent.status, body: unsentJson },
  });
}
