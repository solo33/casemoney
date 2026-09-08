import { Link } from "react-router-dom";

export function FeatureLink({ icon, title, to, children }) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        background: "#fffdf7",
        border: "1px solid #e4ddcd",
        borderRadius: 10,
        padding: 14,
        textDecoration: "none",
        transition: "border-color 150ms, box-shadow 150ms",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#9c7b3c"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#e4ddcd"; }}
    >
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#1b2531", marginBottom: 4 }}>
        {title} →
      </div>
      <div style={{ fontSize: 12.5, color: "#7a8590", lineHeight: 1.4 }}>
        {children}
      </div>
    </Link>
  );
}

export function InfoCard({ eyebrow, title, children }) {
  return (
    <div style={{
      background: "#fffdf7",
      border: "1px solid #e4ddcd",
      borderRadius: 10,
      padding: 16,
    }}>
      <div style={{ color: "#9c7b3c", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {eyebrow}
      </div>
      <h2 style={{ margin: "6px 0 8px", fontSize: 21, fontFamily: "var(--serif)", fontWeight: 600 }}>
        {title}
      </h2>
      <p style={{ margin: 0, color: "#515c68", fontSize: 14, lineHeight: 1.5 }}>
        {children}
      </p>
    </div>
  );
}

export function PricingPill({ plan, desc, highlight }) {
  return (
    <div style={{
      padding: "10px 16px", borderRadius: 999,
      background: highlight ? "linear-gradient(90deg, #173a54 0%, #be123c 100%)" : "#fff",
      color: highlight ? "#fff" : "#1b2531",
      border: highlight ? "none" : "1px solid #e4ddcd",
      fontSize: 13,
      display: "flex", gap: 10, alignItems: "center",
    }}>
      <strong style={{ fontWeight: 700 }}>{plan}</strong>
      <span style={{ opacity: highlight ? 0.9 : 0.7 }}>· {desc}</span>
    </div>
  );
}
