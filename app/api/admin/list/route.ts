import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/admin";
import { requireAdminFromAuthHeader } from "@/app/api/admin/_auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await requireAdminFromAuthHeader(req);
  if (!a.ok) return NextResponse.json({ ok: false, message: a.message }, { status: a.status });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("upload_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
