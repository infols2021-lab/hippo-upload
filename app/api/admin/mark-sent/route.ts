import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/admin";
import { requireAdminFromAuthHeader } from "@/app/api/admin/_auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await requireAdminFromAuthHeader(req);
  if (!a.ok) return NextResponse.json({ ok: false, message: a.message }, { status: a.status });

  const body = await req.json().catch(() => ({} as any));
  const id = String(body?.id || "");
  const sent = !!body?.sent;

  if (!id) return NextResponse.json({ ok: false, message: "No id" }, { status: 400 });

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("upload_requests")
    .update({
      sent,
      sent_at: sent ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
