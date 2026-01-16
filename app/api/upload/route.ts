import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

    if (!reg) return bad("Не передан reg");
    if (!studentName) return bad("Не заполнено ФИО");
    if (!(receipt instanceof File)) return bad("Не прикреплен файл чека");
    if (!(documentFile instanceof File)) return bad("Не прикреплен файл документа");

    // ⚠️ Анти-413: ставим безопасный лимит.
    // Base64 увеличивает размер ~на 33%, плюс накладные расходы — лучше держать <= 5MB/файл.
    const MAX_MB = 5;
    const maxBytes = MAX_MB * 1024 * 1024;
    if (receipt.size > maxBytes) return bad(`Чек больше ${MAX_MB}MB — уменьшите файл`);
    if (documentFile.size > maxBytes) return bad(`Документ больше ${MAX_MB}MB — уменьшите файл`);

    const receiptBase64 = await fileToBase64(receipt);
    const documentBase64 = await fileToBase64(documentFile);

    // ✅ ключ убрали — отправляем просто reg + fio + 2 файла
    const payload = {
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

    const r = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => null);
    if (!j) return bad("GAS вернул не-JSON ответ", 502);

    // пробрасываем ответ GAS как есть
    return NextResponse.json(j, { status: r.ok ? 200 : 400 });
  } catch (e: any) {
    // Если Vercel/Next режет запрос по размеру — иногда будет 413 до сюда.
    return bad("Ошибка сервера: " + String(e?.message || e), 500);
  }
}
