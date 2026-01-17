import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function fileToBase64(file: File) {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab).toString("base64");
}

export async function POST(request: Request) {
  try {
    const GAS_WEBAPP_URL = String(process.env.GAS_WEBAPP_URL || "").trim();
    if (!GAS_WEBAPP_URL) return bad("Не задан GAS_WEBAPP_URL в переменных окружения (Vercel)", 500);

    const form = await request.formData();

    const reg = String(form.get("reg") || "").trim();
    const studentName = String(form.get("studentName") || "").trim();

    const receipt = form.get("receipt");
    const documentFile = form.get("document");
    const parentDocumentFile = form.get("parentDocument"); // может отсутствовать

    if (!reg) return bad("Не передан reg");
    if (!studentName) return bad("Не заполнено ФИО");
    if (!(receipt instanceof File)) return bad("Не прикреплен файл чека");
    if (!(documentFile instanceof File)) return bad("Не прикреплен файл документа кандидата");

    // лимит на файл
    const MAX_MB = 5;
    const maxBytes = MAX_MB * 1024 * 1024;

    if (receipt.size > maxBytes) return bad(`Чек больше ${MAX_MB}MB — уменьшите файл`);
    if (documentFile.size > maxBytes) return bad(`Документ кандидата больше ${MAX_MB}MB — уменьшите файл`);

    if (parentDocumentFile instanceof File) {
      if (parentDocumentFile.size > maxBytes) return bad(`Документ родителя больше ${MAX_MB}MB — уменьшите файл`);
    }

    const receiptBase64 = await fileToBase64(receipt);
    const documentBase64 = await fileToBase64(documentFile);

    const payload: any = {
      reg,
      studentName,
      receipt: {
        name: receipt.name,
        type: receipt.type || "application/octet-stream",
        base64: receiptBase64,
      },
      document: {
        name: documentFile.name,
        type: documentFile.type || "application/octet-stream",
        base64: documentBase64,
      },
    };

    // ✅ опционально добавляем parentDocument
    if (parentDocumentFile instanceof File) {
      const parentBase64 = await fileToBase64(parentDocumentFile);
      payload.parentDocument = {
        name: parentDocumentFile.name,
        type: parentDocumentFile.type || "application/octet-stream",
        base64: parentBase64,
      };
    }

    const r = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => null);
    if (!j) return bad("GAS вернул не-JSON ответ", 502);

    return NextResponse.json(j, { status: r.ok ? 200 : 400 });
  } catch (e: any) {
    return bad("Ошибка сервера: " + String(e?.message || e), 500);
  }
}
