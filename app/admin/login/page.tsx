"use client";

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
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        setMsg("❌ " + String(error?.message || "Не удалось войти"));
        return;
      }
      window.location.href = "/admin";
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

        <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", color: "white" }}
        />

        <div style={{ height: 12 }} />

        <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", color: "white" }}
        />

        <button
          disabled={loading}
          style={{
            width: "100%",
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "none",
            fontWeight: 800,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Входим..." : "Войти"}
        </button>

        {msg && <div style={{ marginTop: 12, fontWeight: 800 }}>{msg}</div>}
      </form>
    </main>
  );
}
