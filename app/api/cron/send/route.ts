import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCronCall(req: Request) {
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const uaOk = ua.includes("vercel-cron/");
  const xCronOk = req.headers.has("x-vercel-cron");
  return uaOk || xCronOk;
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
  try {
    j = JSON.parse(text);
  } catch {
    j = { ok: false, message: "GAS non-JSON: " + String(text || "").slice(0, 250) };
  }

  if (!j?.ok) throw new Error(String(j?.message || "Ошибка отправки в GAS"));
}

function sortByRegionOrder(items: any[], regionOrder: string[]) {
  if (!regionOrder.length) return items;
  const idx = new Map(regionOrder.map((r, i) => [r, i]));
  return items.slice().sort((a, b) => {
    const ia = idx.has(a.reg) ? (idx.get(a.reg) as number) : 9999;
    const ib = idx.has(b.reg) ? (idx.get(b.reg) as number) : 9999;
    if (ia !== ib) return ia - ib;
    return String(a.created_at).localeCompare(String(b.created_at));
  });
}

export async function GET(req: Request) {
  try {
    if (!isCronCall(req)) {
      return NextResponse.json({ ok: false, message: "Forbidden (not a cron call)" }, { status: 403 });
    }

    const sb = supabaseAdmin();

    const regionOrder = ["kur", "orl", "bel", "vor", "tam", "nnov", "lip", "my"];
    const limitEachPass = 120;

    console.log("🕔 CRON SEND START", new Date().toISOString());

    async function processPass(mode: "retry_errors" | "unsent") {
      let q = sb
        .from("upload_requests")
        .select("*")
        .eq("sent", false)
        .order("created_at", { ascending: true })
        .limit(500);

      if (mode === "retry_errors") q = q.not("sent_error", "is", null);
      if (mode === "unsent") q = q.is("sent_error", null);

      const { data, error } = await q;
      if (error) throw new Error(`DB error (${mode}): ${error.message}`);

      let items = sortByRegionOrder(data || [], regionOrder).slice(0, limitEachPass);

      let ok = 0;
      let fail = 0;

      for (const row of items) {
        try {
          await sendOneViaGas(sb, row);

          await sb.from("upload_requests").update({
            sent: true,
            sent_at: new Date().toISOString(),
            sent_error: null,
          }).eq("id", row.id);

          ok++;
          await new Promise((r) => setTimeout(r, 350));
        } catch (e: any) {
          const msg = String(e?.message || e);
          await sb.from("upload_requests").update({
            sent_error: msg.slice(0, 2000),
          }).eq("id", row.id);

          fail++;
          await new Promise((r) => setTimeout(r, 650));
        }
      }

      return { mode, total: items.length, ok, fail };
    }

    const retry = await processPass("retry_errors");
    const unsent = await processPass("unsent");

    console.log("✅ CRON DONE", { retry, unsent });

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
