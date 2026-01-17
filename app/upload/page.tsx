"use client";

import React, { Suspense, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

const REGIONS: Record<string, string> = {
  bel: "Белгородская",
  vor: "Воронежская",
  kur: "Курская",
  tam: "Тамбовская",
  nnov: "Нижегородская",
  lip: "Липецкая",
  orl: "Орловская",
  my: "Моя",
};

const MAX_MB = 5; // лимит НА КАЖДЫЙ файл

function formatSize(bytes: number) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.ceil(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17 8L12 3L7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M13 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9L13 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 2V9H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function isAllowedFile(f: File) {
  const name = String(f?.name ?? "");
  const type = String((f as any)?.type ?? "");
  const okByExt = /\.(pdf|png|jpe?g)$/i.test(name);
  const okByType = /pdf|png|jpe?g/i.test(type);
  return okByExt || okByType;
}

type FileUploadButtonProps = {
  label: string;
  hint?: string;
  required?: boolean;
  file: File | null;
  onPick: (f: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept?: string;
  maxMb?: number;
  setMsg: (m: string) => void;
};

function FileUploadButton({
  label,
  hint,
  required = true,
  file,
  onPick,
  inputRef,
  accept,
  maxMb = MAX_MB,
  setMsg,
}: FileUploadButtonProps) {
  const [drag, setDrag] = useState(false);
  const open = () => inputRef.current?.click();

  const pickFirst = (files: FileList | null | undefined) => {
    const f = files?.[0];
    if (!f) return;

    setMsg(""); // сброс сообщения при выборе

    if (!isAllowedFile(f)) {
      setMsg(`❌ Неверный формат файла: ${f.name}. Разрешено: PDF, JPG/JPEG, PNG.`);
      return;
    }

    const maxBytes = maxMb * 1024 * 1024;
    if (f.size > maxBytes) {
      setMsg(`❌ Файл слишком большой: ${f.name} (${formatSize(f.size)}). Максимум ${maxMb} MB.`);
      return;
    }

    onPick(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag(false);
    pickFirst(e.dataTransfer.files);
  };

  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ marginBottom: "8px" }}>
        <div style={{ fontSize: "16px", fontWeight: "700", color: "#2b3f63", marginBottom: "4px" }}>
          {label}
          {required && <span style={{ color: "#ff5a5a" }}> *</span>}
        </div>
        {hint && <div style={{ fontSize: "13px", color: "rgba(43, 63, 99, 0.65)", lineHeight: 1.25 }}>{hint}</div>}
      </div>

      <div style={{ position: "relative" }}>
        <button
          type="button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            padding: "12px 24px",
            borderRadius: "12px",
            border: drag ? "2px solid #4a7dff" : file ? "2px solid #00a86b" : "2px solid #4a7dff",
            background: drag ? "rgba(74, 125, 255, 0.1)" : file ? "rgba(0, 168, 107, 0.1)" : "rgba(255, 255, 255, 0.9)",
            color: file ? "#006b40" : "#2b3f63",
            fontSize: "16px",
            fontWeight: "700",
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: drag
              ? "0 0 0 4px rgba(74, 125, 255, 0.2), 0 8px 20px rgba(74, 125, 255, 0.25)"
              : file
              ? "0 8px 20px rgba(0, 168, 107, 0.2)"
              : "0 6px 16px rgba(74, 125, 255, 0.2)",
            position: "relative",
            overflow: "hidden",
          }}
          onClick={open}
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDrag(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDrag(false);
          }}
        >
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <UploadIcon />
          </span>
          <span style={{ fontWeight: "700", whiteSpace: "nowrap" }}>{file ? "Изменить файл" : "Выбрать файл"}</span>
        </button>

        <input ref={inputRef as any} style={{ display: "none" }} type="file" accept={accept} onChange={(e) => pickFirst(e.target.files)} />

        {file ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              background: "rgba(255, 255, 255, 0.8)",
              borderRadius: "12px",
              border: "2px solid rgba(0, 168, 107, 0.2)",
              marginTop: "8px",
              boxShadow: "0 4px 12px rgba(0, 168, 107, 0.1)",
              animation: "slideIn 0.3s ease",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                background: "rgba(0, 168, 107, 0.1)",
                borderRadius: "10px",
                color: "#006b40",
              }}
            >
              <FileIcon />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: "600", color: "#2b3f63", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {file.name}
              </div>
              <div style={{ fontSize: "12px", color: "rgba(43, 63, 99, 0.65)", marginTop: "2px" }}>
                {formatSize(file.size)}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                background: "rgba(0, 168, 107, 0.15)",
                borderRadius: "50%",
                color: "#006b40",
              }}
            >
              <CheckIcon />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: "14px", color: "rgba(43, 63, 99, 0.55)", marginTop: "6px", paddingLeft: "4px" }}>
            или перетащите файл сюда (до {maxMb} MB)
          </div>
        )}
      </div>
    </div>
  );
}

function UploadInner() {
  const sp = useSearchParams();
  const regKey = useMemo(() => (sp.get("reg") || "bel").trim(), [sp]);
  const regionName = REGIONS[regKey] || REGIONS["bel"];

  const [studentName, setStudentName] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  const [isUnder14, setIsUnder14] = useState(false);
  const [parentDocFile, setParentDocFile] = useState<File | null>(null);

  const [isSending, setIsSending] = useState(false);
  const [msg, setMsg] = useState("");

  const receiptRef = useRef<HTMLInputElement | null>(null);
  const docRef = useRef<HTMLInputElement | null>(null);
  const parentDocRef = useRef<HTMLInputElement | null>(null);

  const styles = `
    @keyframes slideIn { from { opacity: 0; transform: translateY(-10px);} to { opacity: 1; transform: translateY(0);} }
    @keyframes shine { 0%,100% { transform: translateX(-40%); opacity: 0.55; } 50% { transform: translateX(20%); opacity: 0.85; } }
  `;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    if (!studentName.trim()) return setMsg("❌ Введите ФИО.");
    if (!receipt) return setMsg("❌ Прикрепите сканы оплаты (PDF/JPG/PNG).");
    if (!docFile) return setMsg("❌ Прикрепите документ кандидата (PDF/JPG/PNG).");
    if (isUnder14 && !parentDocFile) return setMsg("❌ Кандидату < 14 лет — прикрепите документ родителя.");

    // финальная проверка размеров на клиенте
    const maxBytes = MAX_MB * 1024 * 1024;
    const allFiles = [
      { key: "Чек", f: receipt },
      { key: "Документ кандидата", f: docFile },
      ...(isUnder14 && parentDocFile ? [{ key: "Документ родителя", f: parentDocFile }] : []),
    ];
    const tooBig = allFiles.find((x) => x.f.size > maxBytes);
    if (tooBig) {
      return setMsg(`❌ ${tooBig.key} слишком большой: ${tooBig.f.name} (${formatSize(tooBig.f.size)}). Максимум ${MAX_MB} MB.`);
    }

    try {
      setIsSending(true);
      setMsg("Загружаем...");

      const fd = new FormData();
      fd.append("reg", regKey);
      fd.append("studentName", studentName.trim());
      fd.append("receipt", receipt);
      fd.append("document", docFile);
      if (isUnder14 && parentDocFile) fd.append("parentDocument", parentDocFile);

      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({} as any));
      const serverMsg = String(data?.message || "");

      if (!res.ok || !data?.ok) {
        if (res.status === 413 || /too large|payload|body|size/i.test(serverMsg)) {
          setMsg(`❌ Слишком большой размер. Нужно до ${MAX_MB} MB *каждый файл*.`);
        } else {
          setMsg(`❌ Ошибка: ${serverMsg || "не удалось загрузить"}`);
        }
        return;
      }

      setMsg(`✅ Готово! ${serverMsg}`.trim());

      setStudentName("");
      setReceipt(null);
      setDocFile(null);
      setIsUnder14(false);
      setParentDocFile(null);
      (document.getElementById("uForm") as HTMLFormElement | null)?.reset();
    } catch (err: any) {
      setMsg("❌ Ошибка: " + (err?.message || String(err)));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <style>{styles}</style>

      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "18px 14px",
          background: `
            radial-gradient(1100px 900px at 50% -10%, rgba(255,255,255,0.85), transparent 60%),
            radial-gradient(900px 600px at 20% 15%, rgba(130, 170, 255, 0.55), transparent 60%),
            radial-gradient(900px 600px at 80% 20%, rgba(150, 190, 255, 0.50), transparent 60%),
            linear-gradient(180deg, #bcd3ff 0%, #cfe0ff 45%, #b9d0ff 100%)
          `,
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: "640px",
            borderRadius: "20px",
            padding: "18px 18px 20px",
            background: "rgba(255, 255, 255, 0.42)",
            border: "1px solid rgba(255, 255, 255, 0.65)",
            boxShadow: `0 24px 60px rgba(50, 85, 150, 0.22), inset 0 1px 0 rgba(255,255,255,0.75)`,
            backdropFilter: "blur(10px)",
          }}
        >
          <h1 style={{ textAlign: "center", margin: "6px 0 8px 0", fontSize: "34px", fontWeight: "800", color: "#2b3f63", letterSpacing: "-0.3px" }}>
            Отправка документов
          </h1>

          <div style={{ textAlign: "center", fontSize: "13px", color: "rgba(43, 63, 99, 0.85)", marginBottom: "10px" }}>
            Регион: <b>{regionName}</b> <span style={{ color: "rgba(43, 63, 99, 0.55)" }}>({regKey})</span>
          </div>

          <div style={{ fontSize: 12, opacity: 0.75, textAlign: "center", marginBottom: 10 }}>
            Форматы: PDF / JPG / PNG. Ограничение: <b>{MAX_MB} MB</b> на каждый файл.
          </div>

          <div style={{ height: "1px", margin: "10px 0 16px", background: "rgba(43, 63, 99, 0.10)" }} />

          <form id="uForm" onSubmit={onSubmit}>
            <div style={{ margin: "18px 0" }}>
              <div style={{ marginBottom: "8px" }}>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#2b3f63" }}>
                  ФИО:<span style={{ color: "#ff5a5a" }}> *</span>
                </div>
              </div>
              <input
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  borderRadius: "999px",
                  padding: "12px 16px",
                  fontSize: "15px",
                  color: "#2b3f63",
                  background: "rgba(255,255,255,0.60)",
                  border: "1px solid rgba(120, 160, 230, 0.40)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 8px 20px rgba(50, 85, 150, 0.10)",
                  outline: "none",
                }}
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Введите ФИО кандидата"
                autoComplete="name"
              />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 14px",
                borderRadius: "14px",
                background: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(120, 160, 230, 0.35)",
                boxShadow: "0 10px 20px rgba(50, 85, 150, 0.08)",
                marginBottom: "18px",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={isUnder14}
                onChange={(e) => {
                  const v = e.target.checked;
                  setIsUnder14(v);
                  if (!v) setParentDocFile(null);
                }}
                style={{ width: 18, height: 18 }}
              />
              <div style={{ color: "#2b3f63", fontWeight: 800, lineHeight: 1.2 }}>
                Кандидату не исполнилось 14 лет
                <div style={{ fontWeight: 600, fontSize: 12, color: "rgba(43, 63, 99, 0.65)", marginTop: 2 }}>
                  Если включить — появится поле для документа родителя
                </div>
              </div>
            </label>

            <FileUploadButton
              label="Сканы оплаты:"
              hint={`PDF/JPG/PNG до ${MAX_MB} MB.`}
              file={receipt}
              onPick={setReceipt}
              inputRef={receiptRef}
              accept=".pdf,.jpg,.jpeg,.png"
              maxMb={MAX_MB}
              required
              setMsg={setMsg}
            />

            <FileUploadButton
              label="Документ кандидата (Свидетельство / Паспорт / Загранпаспорт):"
              hint={`PDF/JPG/PNG до ${MAX_MB} MB.`}
              file={docFile}
              onPick={setDocFile}
              inputRef={docRef}
              accept=".pdf,.jpg,.jpeg,.png"
              maxMb={MAX_MB}
              required
              setMsg={setMsg}
            />

            {isUnder14 && (
              <div style={{ animation: "slideIn 0.25s ease" }}>
                <FileUploadButton
                  label="Документ родителя:"
                  hint={`PDF/JPG/PNG до ${MAX_MB} MB.`}
                  file={parentDocFile}
                  onPick={setParentDocFile}
                  inputRef={parentDocRef}
                  accept=".pdf,.jpg,.jpeg,.png"
                  maxMb={MAX_MB}
                  required
                  setMsg={setMsg}
                />
              </div>
            )}

            <button
              style={{
                width: "100%",
                marginTop: "24px",
                border: "none",
                borderRadius: "999px",
                padding: "18px 20px",
                fontSize: "22px",
                fontWeight: "800",
                color: "#ffffff",
                cursor: isSending ? "not-allowed" : "pointer",
                position: "relative",
                overflow: "hidden",
                opacity: isSending ? 0.85 : 1,
                background:
                  "linear-gradient(180deg, rgba(155, 205, 255, 0.95) 0%, rgba(65, 135, 230, 0.98) 55%, rgba(35, 110, 220, 0.98) 100%)",
                boxShadow: "0 18px 36px rgba(35, 110, 220, 0.35), 0 0 0 6px rgba(150, 200, 255, 0.35), inset 0 2px 0 rgba(255,255,255,0.55)",
              }}
              type="submit"
              disabled={isSending}
            >
              <span
                style={{
                  position: "absolute",
                  inset: "-80px",
                  background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.55), transparent 55%)",
                  transform: "translateX(-40%)",
                  animation: "shine 2.2s ease-in-out infinite",
                  pointerEvents: "none",
                }}
                aria-hidden
              />
              {isSending ? "Отправляем..." : "Отправить"}
            </button>

            {msg && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "14px 16px",
                  borderRadius: "14px",
                  fontWeight: "800",
                  fontSize: "14px",
                  textAlign: "center",
                  background: msg.includes("✅") ? "rgba(235, 255, 242, 0.9)" : "rgba(255, 236, 236, 0.9)",
                  border: msg.includes("✅") ? "2px solid rgba(60, 180, 110, 0.3)" : "2px solid rgba(220, 90, 90, 0.3)",
                  color: msg.includes("✅") ? "#166534" : "#991b1b",
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg}
              </div>
            )}
          </form>
        </section>
      </main>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <UploadInner />
    </Suspense>
  );
}
