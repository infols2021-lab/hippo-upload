import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MB = 5;

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isFileLike(x: unknown): x is File {
  return !!x && typeof (x as any).arrayBuffer === "function" && typeof (x as any).size === "number";
}

function isPdfByNameOrType(file: any): boolean {
  const name = String(file?.name ?? "");
  const type = String(file?.type ?? "");
  return /\.pdf$/i.test(name) || /pdf/i.test(type);
}

function isAllowedByNameOrType(file: any): boolean {
  const name = String(file?.name ?? "");
  const type = String(file?.type ?? "");
  return /\.(pdf|png|jpe?g)$/i.test(name) || /pdf|png|jpe?g/i.test(type);
}

async function looksEncryptedPdf(file: any): Promise<boolean> {
  if (!isFileLike(file)) return false;
  if (!isPdfByNameOrType(file)) return false;

  const ab = await file.slice(0, 1024 * 1024).arrayBuffer();
  const txt = Buffer.from(ab).toString("latin1");

  return txt.includes("/Encrypt") || txt.includes("Filter/Standard") || txt.includes("Filter /Standard");
}

async function fileToBase64(file: any) {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab).toString("base64");
}

export async function POST(request: Request) {
  try {
    const GAS_WEBAPP_URL = String(process.env.GAS_WEBAPP_URL || "").trim();
    if (!GAS_WEBAPP_URL) return bad("Не задан GAS_WEBAPP_URL в переменных окружения (Vercel)", 500);

    const form = await request.formData();

    const reg = String(form.get("reg") ?? "").trim();
    const studentName = String(form.get("studentName") ?? "").trim();

    const receipt = form.get("receipt");
    const documentFile = form.get("document");
    const parentDocumentFile = form.get("parentDocument");

    console.log("UPLOAD META", {
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

    // форматы
    if (!isAllowedByNameOrType(receipt)) return bad("Чек: разрешены только PDF/JPG/PNG");
    if (!isAllowedByNameOrType(documentFile)) return bad("Документ кандидата: разрешены только PDF/JPG/PNG");
    if (isFileLike(parentDocumentFile) && !isAllowedByNameOrType(parentDocumentFile)) {
      return bad("Документ родителя: разрешены только PDF/JPG/PNG");
    }

    // лимит
    const maxBytes = MAX_MB * 1024 * 1024;
    if (receipt.size > maxBytes) return bad(`Чек больше ${MAX_MB}MB — уменьшите файл`);
    if (documentFile.size > maxBytes) return bad(`Документ кандидата больше ${MAX_MB}MB — уменьшите файл`);
    if (isFileLike(parentDocumentFile) && parentDocumentFile.size > maxBytes) {
      return bad(`Документ родителя больше ${MAX_MB}MB — уменьшите файл`);
    }

    // детект защищённых PDF (частая причина “не грузится”)
    if (await looksEncryptedPdf(receipt)) {
      return bad("Чек PDF защищён/зашифрован. Пересохраните через «Печать → PDF» или загрузите JPG/PNG.");
    }
    if (await looksEncryptedPdf(documentFile)) {
      return bad("Документ кандидата PDF защищён/зашифрован. Пересохраните через «Печать → PDF» или загрузите JPG/PNG.");
    }
    if (await looksEncryptedPdf(parentDocumentFile)) {
      return bad("Документ родителя PDF защищён/зашифрован. Пересохраните через «Печать → PDF» или загрузите JPG/PNG.");
    }

    // base64
    const payload: any = {
      reg,
      studentName,
      receipt: {
        name: String((receipt as any)?.name ?? "receipt"),
        type: String((receipt as any)?.type ?? "application/octet-stream"),
        base64: await fileToBase64(receipt),
      },
      document: {
        name: String((documentFile as any)?.name ?? "document"),
        type: String((documentFile as any)?.type ?? "application/octet-stream"),
        base64: await fileToBase64(documentFile),
      },
    };

    if (isFileLike(parentDocumentFile)) {
      payload.parentDocument = {
        name: String((parentDocumentFile as any)?.name ?? "parentDocument"),
        type: String((parentDocumentFile as any)?.type ?? "application/octet-stream"),
        base64: await fileToBase64(parentDocumentFile),
      };
    }

    const r = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // GAS часто возвращает HTTP 200 даже при ошибке — поэтому парсим ответ и статус ставим по j.ok
    const text = await r.text();
    let j: any = null;
    try {
      j = JSON.parse(text);
    } catch {
      console.error("GAS NON-JSON:", text?.slice?.(0, 800));
      return bad("GAS вернул не-JSON ответ", 502);
    }

    const ok = !!j?.ok;
    return NextResponse.json(j, { status: ok ? 200 : 400 });
  } catch (e: any) {
    console.error("UPLOAD ERROR", e?.stack || e);
    return bad("Ошибка сервера: " + String(e?.message || e), 500);
  }
}
