import { supabaseAdmin } from "@/app/lib/supabase/admin";

export async function requireAdminFromAuthHeader(req: Request) {
  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];
  if (!token) return { ok: false as const, status: 401, message: "No token" };

  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user?.email) return { ok: false as const, status: 401, message: "Bad token" };

  const email = data.user.email.toLowerCase();
  if (!allowed.includes(email)) return { ok: false as const, status: 403, message: "Not admin" };

  return { ok: true as const, email };
}
