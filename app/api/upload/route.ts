import { NextResponse } from "next/server";

export const runtime = "nodejs";

function bad(message: string) {
  return NextResponse.json({ ok: false, message });
}

async function fileToBase64(file: File) {
  const ab = await file.arrayBuffer();
  const b = Buffer.from(ab);
  return b.toString("base64");
}

export async function POST(request: Request) {
  try {
    const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL;
    const UPLOAD_KEY = String(process.env.UPLOAD_KEY || "").trim();

    if (!GAS_WEBAPP_URL) return bad("Не задан GAS_WEBAPP_URL в переменных окружения");
    if (!UPLOAD_KEY) return bad("Не задан UPLOAD_KEY в переменных окружения");

    const form = await request.formData();

    const reg = String(form.get("reg") || "").trim();
    const key = String(form.get("key") || "").trim();
    const studentName = String(form.get("studentName") || "").trim();

    const receipt = form.get("receipt");
    const documentFile = form.get("document");

    if (!reg || !studentName) return bad("Не заполнены reg или studentName");
    if (!UPLOAD_KEY) return bad("UPLOAD_KEY не задан на сервере");
    if (key !== UPLOAD_KEY) return bad("Неверный ключ доступа");
    if (!(receipt instanceof File)) return bad("Не прикреплен файл чека");
    if (!(documentFile instanceof File)) return bad("Не прикреплен файл документа");

    const MAX_MB = 10;
    if (receipt.size > MAX_MB * 1024 * 1024) return bad(`Чек больше ${MAX_MB}MB`);
    if (documentFile.size > MAX_MB * 1024 * 1024) return bad(`Документ больше ${MAX_MB}MB`);

    const receiptBase64 = await fileToBase64(receipt);
    const documentBase64 = await fileToBase64(documentFile);

    const payload = {
      reg,
      key, // тот же ключ, GAS тоже проверит
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
    if (!j) return bad("GAS вернул не-JSON ответ");
    return NextResponse.json(j);
  } catch (e: any) {
    return bad("Ошибка сервера: " + String(e?.message || e));
  }
}
