import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/admin";
import { requireAdminFromAuthHeader } from "@/app/api/admin/_auth";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400, extra?: any) {
  return NextResponse.json({ ok: false, message, ...(extra || {}) }, { status });
}

function isCronAuthorized(req: Request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  const tokenH = String(req.headers.get("x-cron-token") || "").trim();
  const tokenQ = String(new URL(req.url).searchParams.get("token") || "").trim();
  return {
    secretSet: !!secret,
    ok: !!secret && (tokenH === secret || tokenQ === secret),
    tokenH: tokenH ? "present" : "missing",
    tokenQ: tokenQ ? "present" : "missing",
  };
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

async function sendOneViaGas(sb: ReturnType<typeof supabaseAdmin>, row: any) {
  const GAS_WEBAPP_URL = String(process.env.GAS_WEBAPP_URL || "").trim();
  if (!GAS_WEBAPP_URL) throw new Error("Не задан GAS_WEBAPP_URL");

  const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET || "hippo-uploads";

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
  try { j = JSON.parse(text); } catch { j = { ok: false, message: "GAS non-JSON: " + String(text || "").slice(0, 250) }; }
  if (!j?.ok) throw new Error(String(j?.message || "Ошибка отправки в GAS"));
}

export async function POST(req: Request) {
  // ✅ либо cron по CRON_SECRET, либо админ Bearer
  const cron = isCronAuthorized(req);

  if (!cron.ok) {
    const a = await requireAdminFromAuthHeader(req);
    if (!a.ok) {
      // ключевая диагностика — почему 401:
      return bad(a.message, a.status, {
        debug: {
          cron: cron,
          hasAuthHeader: !!req.headers.get("authorization"),
          note: "Если это вызов от cron — проверь CRON_SECRET в Production и заголовок x-cron-token",
        },
      });
    }
  }

  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({} as any));

  const mode = String(body?.mode || "unsent");
  const regionOrder: string[] = Array.isArray(body?.regionOrder) ? body.regionOrder.map(String) : [];
  const limit = Math.max(1, Math.min(200, Number(body?.limit || 80)));

  let q = sb
    .from("upload_requests")
    .select("*")
    .eq("sent", false)
    .order("created_at", { ascending: true })
    .limit(500);

  if (mode === "retry_errors") q = q.not("sent_error", "is", null);

  const { data, error } = await q;
  if (error) return bad(error.message, 500);

  let items = (data || []);

  if (regionOrder.length) {
    const idx = new Map(regionOrder.map((r, i) => [r, i]));
    items.sort((a, b) => {
      const ia = idx.has(a.reg) ? (idx.get(a.reg) as number) : 9999;
      const ib = idx.has(b.reg) ? (idx.get(b.reg) as number) : 9999;
      if (ia !== ib) return ia - ib;
      return String(a.created_at).localeCompare(String(b.created_at));
    });
  }

  items = items.slice(0, limit);

  const results: any[] = [];
  for (const row of items) {
    try {
      await sendOneViaGas(sb, row);

      await sb.from("upload_requests").update({
        sent: true,
        sent_at: new Date().toISOString(),
        sent_error: null,
      }).eq("id", row.id);

      results.push({ id: row.id, ok: true });
      await new Promise((r) => setTimeout(r, 350));
    } catch (e: any) {
      const msg = String(e?.message || e);

      await sb.from("upload_requests").update({
        sent_error: msg.slice(0, 2000),
      }).eq("id", row.id);

      results.push({ id: row.id, ok: false, message: msg });
      await new Promise((r) => setTimeout(r, 650));
    }
  }

  const okCount = results.filter((x) => x.ok).length;
  const failCount = results.length - okCount;

  return NextResponse.json({
    ok: true,
    message: `Готово. Успешно: ${okCount}, ошибок: ${failCount}`,
    results,
  });
}
