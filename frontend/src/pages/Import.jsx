import { Link } from "react-router-dom";

const SOURCES = [
  {
    to: "/import/homemoney",
    title: "Из HomeMoney",
    icon: "🏠",
    description: "CSV-выгрузка из ihomemoney.com (date;account;category;total;currency;description;transfer)",
    available: true,
  },
  {
    to: null,
    title: "Из Тинькофф",
    icon: "🟡",
    description: "Выписка в формате CSV (скоро)",
    available: false,
  },
  {
    to: null,
    title: "Из Сбербанк Онлайн",
    icon: "🟢",
    description: "Выписка в формате CSV (скоро)",
    available: false,
  },
  {
    to: null,
    title: "Универсальный CSV",
    icon: "📊",
    description: "Свой формат с маппингом колонок (скоро)",
    available: false,
  },
];

export default function Import() {
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <h1 style={{ marginBottom: 8 }}>Импорт</h1>
      <p style={{ color: "#64748b", marginBottom: 24, fontSize: 14 }}>
        Выберите источник, из которого хотите загрузить транзакции.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 12,
      }}>
        {SOURCES.map(s => (
          <SourceCard key={s.title} {...s} />
        ))}
      </div>
    </div>
  );
}

function SourceCard({ to, title, icon, description, available }) {
  const content = (
    <>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.4 }}>
        {description}
      </div>
      {!available && (
        <div style={{
          marginTop: 10, fontSize: 11, color: "#94a3b8",
          textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          В разработке
        </div>
      )}
    </>
  );

  const baseStyle = {
    display: "block",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 18,
    textDecoration: "none",
    transition: "all 0.15s",
  };

  if (!available) {
    return (
      <div style={{ ...baseStyle, opacity: 0.6, cursor: "not-allowed" }}>
        {content}
      </div>
    );
  }

  return (
    <Link
      to={to}
      style={baseStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#6366f1";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(99,102,241,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#e2e8f0";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {content}
    </Link>
  );
}
