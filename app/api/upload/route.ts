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

/**
 * Быстрая эвристика: проверяем первые ~1MB PDF на маркеры шифрования.
 * Важно: даже если PDF открывается на ПК без пароля, он может быть encrypted/secured.
 * Google Drive это часто показывает как "защищён паролем".
 */
async function looksEncryptedPdf(file: File): Promise<boolean> {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  const isPdf = type.includes("pdf") || name.endsWith(".pdf");
  if (!isPdf) return false;

  // читаем только начало, чтобы не жрать память/время
  const ab = await file.slice(0, 1024 * 1024).arrayBuffer();
  const txt = Buffer.from(ab).toString("latin1");

  // самые частые маркеры
  if (txt.includes("/Encrypt")) return true;

  // иногда пишется без пробелов
  if (txt.includes("Filter/Standard")) return true;

  // иногда с пробелом
  if (txt.includes("Filter /Standard")) return true;

  return false;
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
    if (!(receipt instanceof File)) return bad("Не прикреплен файл чека");
    if (!(documentFile instanceof File)) return bad("Не прикреплен файл документа кандидата");

    // ✅ лимит (в реальности помогает против 413 и перегруза GAS)
    const MAX_MB = 5;
    const maxBytes = MAX_MB * 1024 * 1024;

    if (receipt.size > maxBytes) return bad(`Чек больше ${MAX_MB}MB — уменьшите файл`);
    if (documentFile.size > maxBytes) return bad(`Документ кандидата больше ${MAX_MB}MB — уменьшите файл`);
    if (parentDocumentFile instanceof File && parentDocumentFile.size > maxBytes) {
      return bad(`Документ родителя больше ${MAX_MB}MB — уменьшите файл`);
    }

    // ✅ детект encrypted PDF
    if (await looksEncryptedPdf(receipt)) {
      return bad(
        "Чек в формате PDF защищён/зашифрован. Пересохраните через «Печать → PDF» (Microsoft Print to PDF / Save as PDF) или загрузите JPG/PNG."
      );
    }
    if (await looksEncryptedPdf(documentFile)) {
      return bad(
        "Документ кандидата в формате PDF защищён/зашифрован. Пересохраните через «Печать → PDF» (Microsoft Print to PDF / Save as PDF) или загрузите JPG/PNG."
      );
    }
    if (parentDocumentFile instanceof File) {
      if (await looksEncryptedPdf(parentDocumentFile)) {
        return bad(
          "Документ родителя в формате PDF защищён/зашифрован. Пересохраните через «Печать → PDF» (Microsoft Print to PDF / Save as PDF) или загрузите JPG/PNG."
        );
      }
    }

    // конвертация в base64
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

    // отправка в GAS
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
