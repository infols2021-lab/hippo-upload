import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isFile(x: unknown): x is File {
  return typeof File !== "undefined" && x instanceof File;
}

async function fileToBase64(file: File) {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab).toString("base64");
}

/**
 * Надёжная эвристика: проверяем первые ~1MB PDF на маркеры шифрования.
 * Сделано максимально безопасно: никаких .toLowerCase() на undefined.
 */
async function looksEncryptedPdfSafe(file: unknown): Promise<boolean> {
  if (!isFile(file)) return false;

  const name = String((file as any)?.name || "").toLowerCase();
  const type = String((file as any)?.type || "").toLowerCase();

  const isPdf = type.includes("pdf") || name.endsWith(".pdf");
  if (!isPdf) return false;

  const ab = await file.slice(0, 1024 * 1024).arrayBuffer();
  const txt = Buffer.from(ab).toString("latin1");

  return (
    txt.includes("/Encrypt") ||
    txt.includes("Filter/Standard") ||
    txt.includes("Filter /Standard")
  );
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
    const parentDocumentFile = form.get("parentDocument"); // опционально

    if (!reg) return bad("Не передан reg");
    if (!studentName) return bad("Не заполнено ФИО");
    if (!isFile(receipt)) return bad("Не прикреплен файл чека");
    if (!isFile(documentFile)) return bad("Не прикреплен файл документа кандидата");

    // лимит на файл
    const MAX_MB = 5;
    const maxBytes = MAX_MB * 1024 * 1024;

    if (receipt.size > maxBytes) return bad(`Чек больше ${MAX_MB}MB — уменьшите файл`);
    if (documentFile.size > maxBytes) return bad(`Документ кандидата больше ${MAX_MB}MB — уменьшите файл`);
    if (isFile(parentDocumentFile) && parentDocumentFile.size > maxBytes) {
      return bad(`Документ родителя больше ${MAX_MB}MB — уменьшите файл`);
    }

    // детект encrypted PDF (без крашей)
    if (await looksEncryptedPdfSafe(receipt)) {
      return bad(
        "Чек в формате PDF защищён/зашифрован. Пересохраните через «Печать → PDF» или загрузите JPG/PNG."
      );
    }
    if (await looksEncryptedPdfSafe(documentFile)) {
      return bad(
        "Документ кандидата в формате PDF защищён/зашифрован. Пересохраните через «Печать → PDF» или загрузите JPG/PNG."
      );
    }
    if (await looksEncryptedPdfSafe(parentDocumentFile)) {
      return bad(
        "Документ родителя в формате PDF защищён/зашифрован. Пересохраните через «Печать → PDF» или загрузите JPG/PNG."
      );
    }

    const receiptBase64 = await fileToBase64(receipt);
    const documentBase64 = await fileToBase64(documentFile);

    const payload: any = {
      reg,
      studentName,
      receipt: {
        name: receipt.name || "receipt",
        type: receipt.type || "application/octet-stream",
        base64: receiptBase64,
      },
      document: {
        name: documentFile.name || "document",
        type: documentFile.type || "application/octet-stream",
        base64: documentBase64,
      },
    };

    // опционально parentDocument
    if (isFile(parentDocumentFile)) {
      const parentBase64 = await fileToBase64(parentDocumentFile);
      payload.parentDocument = {
        name: parentDocumentFile.name || "parentDocument",
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
