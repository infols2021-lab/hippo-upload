import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MB = 5;
const BUCKET = process.env.NEXT_PUBLIC_UPLOADS_BUCKET || "hippo-uploads";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isFileLike(x: unknown): x is File {
  return !!x && typeof (x as any).arrayBuffer === "function" && typeof (x as any).size === "number";
}

function isAllowedFileByNameOrType(file: any) {
  const name = String(file?.name ?? "");
  const type = String(file?.type ?? "");
  const okByExt = /\.(pdf|png|jpe?g)$/i.test(name);
  const okByType = /pdf|png|jpe?g/i.test(type);
  return okByExt || okByType;
}

function safeExt(name: string) {
  const m = String(name || "").match(/\.([a-z0-9]+)$/i);
  const ext = (m ? m[1] : "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "pdf") return ext;
  return "bin";
}

async function fileToBuffer(file: File) {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const reg = String(form.get("reg") ?? "").trim();
    const studentName = String(form.get("studentName") ?? "").trim();

    const receipt = form.get("receipt");
    const documentFile = form.get("document");
    const parentDocumentFile = form.get("parentDocument");

    console.log("UPLOAD META (SUPABASE)", {
      reg,
      studentNameLen: studentName.length,
      receipt: {
        exists: !!receipt,
        name: String((receipt as any)?.name ?? ""),
        type: String((receipt as any)?.type ?? ""),
        size: Number((receipt as any)?.size ?? -1),
      },
      document: {
        exists: !!documentFile,
        name: String((documentFile as any)?.name ?? ""),
        type: String((documentFile as any)?.type ?? ""),
        size: Number((documentFile as any)?.size ?? -1),
      },
      parent: {
        exists: !!parentDocumentFile,
        name: String((parentDocumentFile as any)?.name ?? ""),
        type: String((parentDocumentFile as any)?.type ?? ""),
        size: Number((parentDocumentFile as any)?.size ?? -1),
      },
    });

    if (!reg) return bad("Не передан reg");
    if (!studentName) return bad("Не заполнено ФИО");
    if (!isFileLike(receipt)) return bad("Не прикреплен файл чека");
    if (!isFileLike(documentFile)) return bad("Не прикреплен файл документа кандидата");

    if (!isAllowedFileByNameOrType(receipt)) return bad("Чек: разрешены PDF/JPG/JPEG/PNG");
    if (!isAllowedFileByNameOrType(documentFile)) return bad("Документ: разрешены PDF/JPG/JPEG/PNG");
    if (isFileLike(parentDocumentFile) && !isAllowedFileByNameOrType(parentDocumentFile)) {
      return bad("Документ родителя: разрешены PDF/JPG/JPEG/PNG");
    }

    const maxBytes = MAX_MB * 1024 * 1024;
    if (receipt.size > maxBytes) return bad(`Чек больше ${MAX_MB}MB — уменьшите файл`);
    if (documentFile.size > maxBytes) return bad(`Документ кандидата больше ${MAX_MB}MB — уменьшите файл`);
    if (isFileLike(parentDocumentFile) && parentDocumentFile.size > maxBytes) {
      return bad(`Документ родителя больше ${MAX_MB}MB — уменьшите файл`);
    }

    const sb = supabaseAdmin();

    // ✅ ИДЕАЛЬНО: создаём стабильный id заявки и используем его в путях (ASCII всегда)
    const id = globalThis.crypto?.randomUUID?.() || require("crypto").randomUUID();
    const isUnder14 = isFileLike(parentDocumentFile);

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const folder = `${reg}/${id}_${ts}`;

    async function uploadOne(file: File, label: "receipt" | "document" | "parent") {
      const ext = safeExt(file.name);
      const path = `${folder}/${label}.${ext}`;

      const buf = await fileToBuffer(file);
      const { error } = await sb.storage.from(BUCKET).upload(path, buf, {
        contentType: (file as any).type || "application/octet-stream",
        upsert: false,
      });

      if (error) throw new Error(`Storage upload failed (${label}): ${error.message} | path=${path}`);
      return path;
    }

    const receiptPath = await uploadOne(receipt as File, "receipt");
    const documentPath = await uploadOne(documentFile as File, "document");
    const parentPath = isUnder14 ? await uploadOne(parentDocumentFile as File, "parent") : null;

    // ✅ Пишем запись в таблицу с тем же id (чтобы всё стыковалось идеально)
    const { error: dbErr } = await sb.from("upload_requests").insert({
      id,
      reg,
      student_name: studentName,
      is_under14: isUnder14,
      receipt_path: receiptPath,
      document_path: documentPath,
      parent_document_path: parentPath,
      sent: false,
    });

    if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);

    return NextResponse.json({ ok: true, message: "Файлы загружены ✅" });
  } catch (e: any) {
    console.error("UPLOAD ERROR (SUPABASE)", e?.stack || e);
    return bad("Ошибка сервера: " + String(e?.message || e), 500);
  }
}
