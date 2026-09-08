import { TYPE_LABELS } from "../../utils/tBankImportView";

export function PreviewStats({ totals }) {
  const cards = [
    ["Строк в файле", totals.source_rows],
    ["Операций", totals.operations],
    ["Переводов", totals.transfers],
    ["Уже импортировано", totals.duplicates],
    ["Ошибок", totals.errors],
  ];
  return (
    <div className="tbank-stats">
      {cards.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function MappingRow({ label, hint, children }) {
  return (
    <div className="tbank-mapping-row">
      <div>
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      {children}
    </div>
  );
}

export function OperationPreview({ rows }) {
  return (
    <div className="table-wrap tbank-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Тип</th>
            <th>Карта</th>
            <th>Категория / описание</th>
            <th style={{ textAlign: "right" }}>Сумма</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.line_no}-${row.source_lines.join("-")}`}>
              <td>{row.date ? new Date(row.date).toLocaleString("ru-RU") : "—"}</td>
              <td>{TYPE_LABELS[row.tx_type]}</td>
              <td>
                {row.source_key === "__without_card__" ? "Без номера" : row.source_key}
                {row.target_source_key && ` → ${row.target_source_key}`}
              </td>
              <td>
                <strong>{row.category}</strong>
                {row.description && <span>{row.description}</span>}
              </td>
              <td className={`tbank-amount is-${row.tx_type}`}>
                {row.tx_type === "expense" ? "−" : row.tx_type === "income" ? "+" : ""}
                {row.amount.toLocaleString("ru-RU")} {row.currency}
              </td>
              <td>
                {row.error
                  ? <span className="tbank-status error">{row.error}</span>
                  : row.duplicate
                    ? <span className="tbank-status duplicate">Дубль</span>
                    : <span className="tbank-status ready">Готово</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ImportResult({ result, reset, navigate }) {
  return (
    <div className="tbank-result">
      <h2>Импорт завершён</h2>
      <p>
        Добавлено операций: <strong>{result.imported}</strong>.
        {result.duplicates > 0 && <> Дублей пропущено: <strong>{result.duplicates}</strong>.</>}
        {result.unmapped > 0 && <> Без сопоставленного счёта: <strong>{result.unmapped}</strong>.</>}
      </p>
      {result.errors?.length > 0 && (
        <details>
          <summary>Ошибки ({result.errors.length})</summary>
          <ul>
            {result.errors.map((item, index) => (
              <li key={`${item.line_no}-${index}`}>
                Строка {item.line_no}: {item.error}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="tbank-actions">
        <button type="button" onClick={() => navigate("/transactions")}>
          К записям
        </button>
        <button type="button" className="btn-ghost" onClick={reset}>
          Импортировать ещё
        </button>
      </div>
    </div>
  );
}
