import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/admin";
import { requireAdminFromAuthHeader } from "@/app/api/admin/_auth";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function extFromPath(p: string) {
  const m = String(p || "").match(/\.([a-z0-9]+)$/i);
  return (m ? m[1] : "").toLowerCase();
}

function mimeFromExt(ext: string) {
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

async function blobToBase64(blob: Blob) {
  const ab = await blob.arrayBuffer();
  return Buffer.from(ab).toString("base64");
}

export async function POST(req: Request) {
  try {
    const a = await requireAdminFromAuthHeader(req);
    if (!a.ok) return bad(a.message, a.status);

    const GAS_WEBAPP_URL = String(process.env.GAS_WEBAPP_URL || "").trim();
    if (!GAS_WEBAPP_URL) return bad("Не задан GAS_WEBAPP_URL в переменных окружения", 500);

    const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET || "hippo-uploads";
    const sb = supabaseAdmin();

    const body = await req.json().catch(() => ({} as any));
    const id = String(body?.id || "").trim();
    if (!id) return bad("Нет id");

    const { data: row, error } = await sb
      .from("upload_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !row) return bad("Запись не найдена", 404);
    if (row.sent) return bad("Уже отправлено", 409);

    async function downloadB64(path: string) {
      const { data, error } = await sb.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`Не удалось скачать из Storage: ${path}: ${error?.message || "no data"}`);
      return blobToBase64(data);
    }

    const receiptB64 = await downloadB64(row.receipt_path);
    const documentB64 = await downloadB64(row.document_path);
    const parentB64 = row.parent_document_path ? await downloadB64(row.parent_document_path) : null;

    const receiptExt = extFromPath(row.receipt_path) || "pdf";
    const documentExt = extFromPath(row.document_path) || "pdf";
    const parentExt = row.parent_document_path ? (extFromPath(row.parent_document_path) || "pdf") : "pdf";

    const payload: any = {
      reg: row.reg,
      studentName: row.student_name,
      receipt: { name: `receipt.${receiptExt}`, type: mimeFromExt(receiptExt), base64: receiptB64 },
      document: { name: `document.${documentExt}`, type: mimeFromExt(documentExt), base64: documentB64 },
    };

    if (parentB64 && row.parent_document_path) {
      payload.parentDocument = { name: `parent.${parentExt}`, type: mimeFromExt(parentExt), base64: parentB64 };
    }

    const r = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    let j: any = null;
    try {
      j = JSON.parse(text);
    } catch {
      j = { ok: false, message: "GAS вернул не-JSON: " + String(text || "").slice(0, 250) };
    }

    if (!j?.ok) {
      // ✅ пишем sent_error
      await sb.from("upload_requests").update({
        sent_error: String(j?.message || "Ошибка отправки в GAS"),
      }).eq("id", id);

      return bad(String(j?.message || "Ошибка отправки в GAS"), 502);
    }

    // ✅ успех: sent=true + чистим sent_error
    const { error: upErr } = await sb
      .from("upload_requests")
      .update({ sent: true, sent_at: new Date().toISOString(), sent_error: null })
      .eq("id", id);

    if (upErr) return bad("Отправлено, но не удалось обновить статус в БД: " + upErr.message, 500);

    return NextResponse.json({ ok: true, message: "Отправлено ✅" });
  } catch (e: any) {
    console.error("SEND ERROR", e?.stack || e);
    return bad("Ошибка сервера: " + String(e?.message || e), 500);
  }
}
