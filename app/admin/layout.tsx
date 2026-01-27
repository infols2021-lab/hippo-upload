export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1100px 900px at 50% -10%, rgba(255,255,255,0.85), transparent 60%)," +
          "radial-gradient(900px 600px at 20% 15%, rgba(130, 170, 255, 0.55), transparent 60%)," +
          "radial-gradient(900px 600px at 80% 20%, rgba(150, 190, 255, 0.50), transparent 60%)," +
          "linear-gradient(180deg, #bcd3ff 0%, #cfe0ff 45%, #b9d0ff 100%)",
        padding: "18px 14px",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>{children}</div>
    </div>
  );
}
