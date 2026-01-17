import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isFileLike(x: unknown): x is File {
  // В Vercel Node runtime File обычно существует, но подстрахуемся
  return !!x && typeof (x as any).arrayBuffer === "function" && typeof (x as any).size === "number";
}

function isPdfByNameOrType(file: any): boolean {
  const name = String(file?.name ?? "");
  const type = String(file?.type ?? "");
  // без toLowerCase: regex i
  return /\.pdf$/i.test(name) || /pdf/i.test(type);
}

async function looksEncryptedPdf(file: any): Promise<boolean> {
  if (!isFileLike(file)) return false;
  if (!isPdfByNameOrType(file)) return false;

  const ab = await file.slice(0, 1024 * 1024).arrayBuffer();
  const txt = Buffer.from(ab).toString("latin1");

  // маркеры шифрования
  return (
    txt.includes("/Encrypt") ||
    txt.includes("Filter/Standard") ||
    txt.includes("Filter /Standard")
  );
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
    const parentDocumentFile = form.get("parentDocument"); // опционально

    // ЛОГИ (помогают поймать “что пришло”)
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

    const MAX_MB = 5;
    const maxBytes = MAX_MB * 1024 * 1024;

    if (receipt.size > maxBytes) return bad(`Чек больше ${MAX_MB}MB — уменьшите файл`);
    if (documentFile.size > maxBytes) return bad(`Документ кандидата больше ${MAX_MB}MB — уменьшите файл`);
    if (isFileLike(parentDocumentFile) && parentDocumentFile.size > maxBytes) {
      return bad(`Документ родителя больше ${MAX_MB}MB — уменьшите файл`);
    }

    // Детект “защищённых” PDF
    if (await looksEncryptedPdf(receipt)) {
      return bad("Чек PDF защищён/зашифрован. Пересохраните через «Печать → PDF» или загрузите JPG/PNG.");
    }
    if (await looksEncryptedPdf(documentFile)) {
      return bad("Документ кандидата PDF защищён/зашифрован. Пересохраните через «Печать → PDF» или загрузите JPG/PNG.");
    }
    if (await looksEncryptedPdf(parentDocumentFile)) {
      return bad("Документ родителя PDF защищён/зашифрован. Пересохраните через «Печать → PDF» или загрузите JPG/PNG.");
    }

    const receiptBase64 = await fileToBase64(receipt);
    const documentBase64 = await fileToBase64(documentFile);

    const payload: any = {
      reg,
      studentName,
      receipt: {
        name: String((receipt as any)?.name ?? "receipt"),
        type: String((receipt as any)?.type ?? "application/octet-stream"),
        base64: receiptBase64,
      },
      document: {
        name: String((documentFile as any)?.name ?? "document"),
        type: String((documentFile as any)?.type ?? "application/octet-stream"),
        base64: documentBase64,
      },
    };

    if (isFileLike(parentDocumentFile)) {
      const parentBase64 = await fileToBase64(parentDocumentFile);
      payload.parentDocument = {
        name: String((parentDocumentFile as any)?.name ?? "parentDocument"),
        type: String((parentDocumentFile as any)?.type ?? "application/octet-stream"),
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
    console.error("UPLOAD ERROR", e);
    return bad("Ошибка сервера: " + String(e?.message || e), 500);
  }
}
