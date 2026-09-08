

export function InfoRow({ label, value, mono = false }) {
  return (
    <div className="about-info-row" style={{ display: "flex", justifyContent: "space-between", gap: 20, padding: "11px 0", borderBottom: "1px solid #ece6d8" }}>
      <span style={{ color: "#7a8590" }}>{label}</span>
      <span style={{ color: "#173a54", fontWeight: 600, fontFamily: mono ? "var(--font-mono)" : undefined }}>{value}</span>
    </div>
  );
}
