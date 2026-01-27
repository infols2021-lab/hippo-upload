import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isAllowedAdmin(email: string) {
  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

async function hmacHexNode(secret: string, msg: string) {
  const crypto = await import("crypto");
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}

export async function POST(req: Request) {
  try {
    const secret = String(process.env.ADMIN_SESSION_SECRET || "").trim();
    if (!secret) return bad("ADMIN_SESSION_SECRET not set", 500);

    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    const token = m?.[1];
    if (!token) return bad("No bearer token", 401);

    const sb = supabaseAdmin();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user?.email) return bad("Bad token", 401);

    const email = data.user.email;
    if (!isAllowedAdmin(email)) return bad("Not admin", 403);

    // cookie token: email|exp|sig
    const exp = Date.now() + 1000 * 60 * 60 * 24 * 14; // 14 дней
    const sig = await hmacHexNode(secret, `${email}|${exp}`);
    const cookieVal = `${email}|${exp}|${sig}`;

    const res = NextResponse.json({ ok: true });
    res.cookies.set("admin_session", cookieVal, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    return res;
  } catch (e: any) {
    return bad("Server error: " + String(e?.message || e), 500);
  }
}
