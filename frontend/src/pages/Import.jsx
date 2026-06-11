import { Link } from "react-router-dom";

export default function Import() {
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <h1 style={{ marginBottom: 8 }}>Импорт</h1>
      <p style={{ color: "#7a8590", marginBottom: 24, fontSize: 14 }}>
        Загрузите файл с операциями, проверьте найденные счета, категории и валюты, затем подтвердите импорт.
      </p>

      <Link
        to="/import/file"
        style={{
          display: "block",
          background: "#fffdf7",
          border: "1px solid #e4ddcd",
          borderRadius: 10,
          padding: 18,
          textDecoration: "none",
          maxWidth: 520,
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📥</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#1b2531", marginBottom: 6 }}>
          Импорт из CSV или Excel
        </div>
        <div style={{ fontSize: 13, color: "#7a8590", lineHeight: 1.5 }}>
          Поддерживаются файлы CSV, XLSX и XLS со структурой колонок:
          <code style={{
            display: "block",
            marginTop: 8,
            padding: "8px 10px",
            background: "#efe9db",
            border: "1px solid #e4ddcd",
            borderRadius: 6,
            color: "#515c68",
            whiteSpace: "nowrap",
            overflowX: "auto",
          }}>
            date;account;category;amount;currency;description;transfer
          </code>
        </div>
      </Link>
    </div>
  );
}
