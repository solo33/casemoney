import { Link } from "react-router-dom";


export default function Import() {
  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <Link className="tbank-back-link" to="/transactions">← К записям</Link>
      <h1>Импорт</h1>
      <p style={{ color: "#7a8590", marginBottom: 24, fontSize: 14 }}>
        Выберите источник. Перед сохранением CaseMoney покажет найденные
        операции и попросит проверить сопоставления.
      </p>

      <div className="import-source-grid">
        <Link className="import-source-card is-tbank" to="/import/tbank">
          <div className="import-source-logo">T</div>
          <div>
            <strong>Т‑Банк</strong>
            <span>
              Импорт официальной CSV-выгрузки, сопоставление карт и категорий,
              объединение переводов и защита от дублей.
            </span>
          </div>
        </Link>

        <Link className="import-source-card" to="/import/file">
          <div className="import-source-logo is-generic">CSV</div>
          <div>
            <strong>Универсальный CSV или Excel</strong>
            <span>
              Для выгрузок CaseMoney, HomeMoney и подготовленных вручную
              файлов CSV, XLSX или XLS.
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}
