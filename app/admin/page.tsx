"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabase/browser";

type Row = {
  id: string;
  created_at: string;
  reg: string;
  student_name: string;
  is_under14: boolean;
  receipt_path: string;
  document_path: string;
  parent_document_path: string | null;
  sent: boolean;
  sent_at: string | null;
};

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

function fmt(dt: string | null) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

function chip(text: string, bg: string, color: string) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        background: bg,
        color,
        fontWeight: 900,
        fontSize: 12,
        lineHeight: 1,
      }}
    >
      {text}
    </span>
  );
}

export default function AdminPage() {
  const sb = supabaseBrowser();

  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const [onlyUnsent, setOnlyUnsent] = useState(true);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<string>("all");

  const [busyId, setBusyId] = useState<string | null>(null);

  // массовая отправка
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchDone, setBatchDone] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const stopRef = useRef(false);

  const stats = useMemo(() => {
    const total = rows.length;
    const sent = rows.filter((x) => x.sent).length;
    const unsent = total - sent;

    const byReg: Record<string, { total: number; unsent: number }> = {};
    for (const x of rows) {
      if (!byReg[x.reg]) byReg[x.reg] = { total: 0, unsent: 0 };
      byReg[x.reg].total += 1;
      if (!x.sent) byReg[x.reg].unsent += 1;
    }
    return { total, sent, unsent, byReg };
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows.slice();

    if (onlyUnsent) r = r.filter((x) => !x.sent);
    if (region !== "all") r = r.filter((x) => x.reg === region);

    const qq = q.trim().toLowerCase();
    if (qq) {
      r = r.filter((x) => (x.student_name || "").toLowerCase().includes(qq));
    }

    return r;
  }, [rows, onlyUnsent, region, q]);

  async function getToken() {
    const { data } = await sb.auth.getSession();
    return data.session?.access_token || "";
  }

  async function load() {
    setMsg("");
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        window.location.href = "/admin/login";
        return;
      }

      const r = await fetch("/api/admin/list", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j?.ok) {
        setMsg("❌ " + String(j?.message || "Ошибка загрузки"));
        return;
      }

      setRows(j.data || []);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await sb.auth.signOut();
    window.location.href = "/admin/login";
  }

  async function openSigned(path: string) {
    setMsg("");
    const token = await getToken();
    if (!token) return (window.location.href = "/admin/login");

    const r = await fetch("/api/admin/signed-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path }),
    });

    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) {
      setMsg("❌ " + String(j?.message || "Ошибка"));
      return;
    }

    window.open(j.url, "_blank");
  }

  async function markSent(id: string, sent: boolean) {
    setMsg("");
    const token = await getToken();
    if (!token) return (window.location.href = "/admin/login");

    const r = await fetch("/api/admin/mark-sent", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, sent }),
    });

    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) {
      setMsg("❌ " + String(j?.message || "Ошибка"));
      return;
    }

    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, sent, sent_at: sent ? new Date().toISOString() : null } : x)));
  }

  async function sendOne(id: string) {
    setMsg("");
    const token = await getToken();
    if (!token) return (window.location.href = "/admin/login");

    setBusyId(id);
    try {
      const r = await fetch("/api/admin/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j?.ok) {
        setMsg("❌ " + String(j?.message || "Ошибка отправки"));
        return false;
      }

      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, sent: true, sent_at: new Date().toISOString() } : x)));
      return true;
    } finally {
      setBusyId(null);
    }
  }

  async function sendAll() {
    setMsg("");
    if (batchRunning) return;

    const list = filtered.filter((x) => !x.sent);
    if (list.length === 0) {
      setMsg("ℹ️ Нет неотправленных по текущим фильтрам.");
      return;
    }

    const ok = window.confirm(`Отправить ВСЕ неотправленные по фильтрам: ${list.length} шт.?`);
    if (!ok) return;

    stopRef.current = false;
    setBatchRunning(true);
    setBatchDone(0);
    setBatchTotal(list.length);

    try {
      // отправляем по одной (надежнее для GAS/Drive), можно будет потом ускорить батчами
      let done = 0;
      for (const item of list) {
        if (stopRef.current) break;

        const success = await sendOne(item.id);
        done += 1;
        setBatchDone(done);

        // маленькая пауза, чтобы Drive/GAS не “задушило”
        await new Promise((r) => setTimeout(r, success ? 350 : 650));
      }

      if (stopRef.current) setMsg("⏸️ Массовая отправка остановлена.");
      else setMsg("✅ Массовая отправка завершена.");
    } finally {
      setBatchRunning(false);
    }
  }

  function stopAll() {
    stopRef.current = true;
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        style={{
          borderRadius: 18,
          padding: "16px 16px",
          background: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 24px 60px rgba(50, 85, 150, 0.18), inset 0 1px 0 rgba(255,255,255,0.7)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 24, fontWeight: 1000, color: "#2b3f63", letterSpacing: -0.2 }}>Admin отправка</div>

          <button onClick={load} disabled={loading} style={{ padding: "10px 12px", borderRadius: 12, border: "none", fontWeight: 900, cursor: "pointer" }}>
            {loading ? "Загрузка..." : "Обновить"}
          </button>

          <button onClick={logout} style={{ padding: "10px 12px", borderRadius: 12, border: "none", fontWeight: 900, cursor: "pointer" }}>
            Выйти
          </button>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {chip(`Всего: ${stats.total}`, "rgba(255,255,255,0.7)", "#1f2937")}
            {chip(`Неотпр.: ${stats.unsent}`, "rgba(255,236,236,0.9)", "#991b1b")}
            {chip(`Отпр.: ${stats.sent}`, "rgba(235,255,242,0.9)", "#166534")}
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 240px 220px 220px", gap: 10, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по ФИО..."
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(120,160,230,0.35)",
              background: "rgba(255,255,255,0.65)",
              outline: "none",
              fontWeight: 700,
              color: "#2b3f63",
            }}
          />

          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(120,160,230,0.35)",
              background: "rgba(255,255,255,0.65)",
              outline: "none",
              fontWeight: 800,
              color: "#2b3f63",
            }}
          >
            <option value="all">Все регионы</option>
            {Object.keys(REGIONS).map((k) => (
              <option key={k} value={k}>
                {REGIONS[k]} ({k})
              </option>
            ))}
          </select>

          <label style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.55)", border: "1px solid rgba(120,160,230,0.25)" }}>
            <input type="checkbox" checked={onlyUnsent} onChange={(e) => setOnlyUnsent(e.target.checked)} />
            <span style={{ fontWeight: 900, color: "#2b3f63" }}>Только неотправленные</span>
          </label>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={sendAll}
              disabled={batchRunning || filtered.filter((x) => !x.sent).length === 0}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                fontWeight: 1000,
                cursor: batchRunning ? "not-allowed" : "pointer",
                color: "white",
                background: "linear-gradient(180deg, rgba(65,135,230,0.98), rgba(35,110,220,0.98))",
                boxShadow: "0 16px 30px rgba(35,110,220,0.25)",
              }}
            >
              {batchRunning ? "Отправляем..." : "🚀 Отправить все"}
            </button>

            <button
              onClick={stopAll}
              disabled={!batchRunning}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                fontWeight: 1000,
                cursor: batchRunning ? "pointer" : "not-allowed",
                color: "white",
                background: "linear-gradient(180deg, rgba(239,68,68,0.95), rgba(185,28,28,0.98))",
                opacity: batchRunning ? 1 : 0.6,
              }}
            >
              ⏹ Стоп
            </button>
          </div>
        </div>

        {batchRunning && (
          <div style={{ marginTop: 10, fontWeight: 900, color: "#2b3f63" }}>
            Прогресс: {batchDone}/{batchTotal}
          </div>
        )}

        {msg && (
          <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 14, fontWeight: 900, background: "rgba(255,255,255,0.65)", border: "1px solid rgba(120,160,230,0.25)", color: "#2b3f63", whiteSpace: "pre-wrap" }}>
            {msg}
          </div>
        )}
      </div>

      <div style={{ height: 14 }} />

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((r) => (
          <div
            key={r.id}
            style={{
              borderRadius: 18,
              padding: "14px 14px",
              background: "rgba(255,255,255,0.55)",
              border: "1px solid rgba(255,255,255,0.7)",
              boxShadow: "0 16px 40px rgba(50,85,150,0.14)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 1000, fontSize: 16, color: "#1f2a44" }}>{r.student_name}</div>
              <div style={{ opacity: 0.85, color: "#2b3f63", fontWeight: 800 }}>
                {REGIONS[r.reg] ? `${REGIONS[r.reg]} (${r.reg})` : r.reg} · {fmt(r.created_at)}
              </div>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {r.is_under14 && chip("<14", "rgba(255,247,237,0.95)", "#b45309")}
                {r.sent ? chip("Отправлено", "rgba(235,255,242,0.9)", "#166534") : chip("Не отправлено", "rgba(255,236,236,0.9)", "#991b1b")}
              </div>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => openSigned(r.receipt_path)} style={{ padding: "10px 12px", borderRadius: 12, border: "none", fontWeight: 900, cursor: "pointer" }}>
                Скачать чек
              </button>
              <button onClick={() => openSigned(r.document_path)} style={{ padding: "10px 12px", borderRadius: 12, border: "none", fontWeight: 900, cursor: "pointer" }}>
                Скачать документ
              </button>
              {r.parent_document_path && (
                <button onClick={() => openSigned(r.parent_document_path!)} style={{ padding: "10px 12px", borderRadius: 12, border: "none", fontWeight: 900, cursor: "pointer" }}>
                  Скачать родителя
                </button>
              )}

              {!r.sent && (
                <button
                  onClick={() => sendOne(r.id)}
                  disabled={busyId === r.id || batchRunning}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "none",
                    fontWeight: 1000,
                    cursor: busyId === r.id || batchRunning ? "not-allowed" : "pointer",
                    color: "white",
                    background: "linear-gradient(180deg, rgba(65,135,230,0.98), rgba(35,110,220,0.98))",
                  }}
                >
                  {busyId === r.id ? "Отправляем..." : "🚀 Отправить"}
                </button>
              )}

              {!r.sent ? (
                <button onClick={() => markSent(r.id, true)} disabled={batchRunning} style={{ padding: "10px 12px", borderRadius: 12, border: "none", fontWeight: 900, cursor: "pointer" }}>
                  ✅ Отметить отправлено (вручную)
                </button>
              ) : (
                <button onClick={() => markSent(r.id, false)} disabled={batchRunning} style={{ padding: "10px 12px", borderRadius: 12, border: "none", fontWeight: 900, cursor: "pointer" }}>
                  ↩️ Вернуть в неотпр.
                </button>
              )}
            </div>

            {r.sent_at && <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>sent_at: {fmt(r.sent_at)}</div>}
          </div>
        ))}

        {!loading && filtered.length === 0 && <div style={{ opacity: 0.8, fontWeight: 900, color: "#2b3f63" }}>Ничего не найдено.</div>}
      </div>
    </>
  );
}
