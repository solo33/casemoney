import { Link } from "react-router-dom";
import { muted } from "./Section";

export function NavRow({ to, icon, title, description }) {
  return (
    <Link
      to={to}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px", borderRadius: 8,
        border: "1px solid #e4ddcd", background: "#f6f2e9",
        textDecoration: "none", color: "inherit",
      }}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontWeight: 600, fontSize: 14, color: "#1b2531" }}>{title}</span>
        <span style={{ display: "block", fontSize: 12, color: "#7a8590", marginTop: 2 }}>{description}</span>
      </span>
      <span style={{ color: "#9c7b3c", fontSize: 18 }}>→</span>
    </Link>
  );
}

export function Field({ label, children }) {
  return (
    <label className="settings-field">
      <span style={{ fontSize: 13, color: "#7a8590" }}>{label}</span>
      {children}
    </label>
  );
}

export function DangerRow({ title, description, label, onClick, destructive }) {
  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
      padding: "10px 0", borderTop: "1px solid #ece6d8",
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12, color: "#7a8590", marginTop: 2 }}>{description}</div>
      </div>
      <button
        onClick={onClick}
        className="btn-danger"
        style={{
          background: destructive ? "#a53825" : "#fff",
          color: destructive ? "#fff" : "#a53825",
          border: destructive ? "none" : "1px solid #fecdd3",
          padding: "6px 14px", fontSize: 13,
        }}
      >
        {label}
      </button>
    </div>
  );
}

export function FlashBox({ color, bg, border, children }) {
  return (
    <div style={{
      color, background: bg, border: `1px solid ${border}`,
      padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 14,
    }}>
      {children}
    </div>
  );
}

export function PlanCard({ limits, selectedMode, familyAccess, onModeChange }) {
  const u = limits?.usage || {};
  const items = [
    { key: "accounts", label: "Счета" },
    { key: "categories", label: "Категории" },
    { key: "user_currencies", label: "Валюты" },
  ];

  return (
    <div style={{
      background: "#fffdf7", border: "1px solid #173a54", borderRadius: 10,
      padding: 18, marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{
          margin: 0, fontFamily: "var(--serif)", fontSize: 20,
          fontWeight: 600, color: "#1b2531",
        }}>
          {selectedMode === "family" ? "Family" : "Personal"}
        </h3>
      </div>

      <p style={{ ...muted, marginBottom: 12 }}>
        {selectedMode === "family"
          ? "Family включает все возможности Personal и семейные финансы."
          : "Personal включает личные счета, категории, валюты, импорт, экспорт и отчеты."}
      </p>

      {selectedMode === "personal" && familyAccess && (
        <p style={{ ...muted, marginBottom: 12, color: "#167a4a", fontWeight: 600 }}>
          🎉 Пока идёт бесплатный запуск, вам уже доступны все функции Family — платить не нужно.
        </p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {selectedMode !== "family" && <button type="button" onClick={() => onModeChange("family")}>Выбрать Family</button>}
        {selectedMode !== "personal" && <button type="button" className="btn-secondary" onClick={() => onModeChange("personal")}>Перейти на Personal</button>}
        {!familyAccess && <Link to="/settings/billing" style={{ display: "inline-block", paddingTop: 8, fontWeight: 700 }}>Оплатить Family →</Link>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
        {items.map(it => {
          const used = u[it.key] ?? 0;
          return (
            <div key={it.key} style={{
              background: "#f6f2e9",
              border: "1px solid #e4ddcd",
              borderRadius: 8,
              padding: 12,
            }}>
              <div style={{ color: "#7a8590", fontSize: 12 }}>{it.label}</div>
              <div style={{ color: "#1b2531", fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                {used}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
