import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/admin";
import { requireAdminFromAuthHeader } from "@/app/api/admin/_auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await requireAdminFromAuthHeader(req);
  if (!a.ok) return NextResponse.json({ ok: false, message: a.message }, { status: a.status });

  const body = await req.json().catch(() => ({} as any));
  const path = String(body?.path || "");
  if (!path) return NextResponse.json({ ok: false, message: "No path" }, { status: 400 });

  const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET || "hippo-uploads";
  const sb = supabaseAdmin();

  // 2 минуты хватит, чтобы открыть/скачать
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 120);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ ok: false, message: error?.message || "signed url error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: data.signedUrl });
}
