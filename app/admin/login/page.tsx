"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabase/browser";

export default function AdminLoginPage() {
  const sb = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      // 1) Supabase login
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data?.session) {
        setMsg("❌ " + String(error?.message || "Не удалось войти"));
        return;
      }

      // 2) Берём access token
      const { data: sessionData } = await sb.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setMsg("❌ Не удалось получить токен сессии");
        return;
      }

      // 3) Ставим httpOnly cookie admin_session (сервер проверит, что ты админ по ADMIN_EMAILS)
      const r = await fetch("/api/admin/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j?.ok) {
        setMsg("❌ " + String(j?.message || "Не удалось подтвердить админ-доступ"));
        return;
      }

      // 4) Редиректим туда, куда хотели
      const next = new URLSearchParams(window.location.search).get("next") || "/admin";
      window.location.href = next;
    } catch (err: any) {
      setMsg("❌ Ошибка: " + String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "#0b1020" }}>
      <form
        onSubmit={onLogin}
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 18,
          borderRadius: 16,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "white",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 10 }}>Admin вход</h1>

        <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          autoComplete="email"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(0,0,0,0.25)",
            color: "white",
            outline: "none",
          }}
        />

        <div style={{ height: 12 }} />

        <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(0,0,0,0.25)",
            color: "white",
            outline: "none",
          }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "none",
            fontWeight: 900,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.8 : 1,
          }}
        >
          {loading ? "Входим..." : "Войти"}
        </button>

        {msg && <div style={{ marginTop: 12, fontWeight: 900, whiteSpace: "pre-wrap" }}>{msg}</div>}

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
          Если не пускает: проверь переменные <b>ADMIN_EMAILS</b> и <b>ADMIN_SESSION_SECRET</b> на Vercel.
        </div>
      </form>
    </main>
  );
}
