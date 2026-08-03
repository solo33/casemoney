import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";


const TYPE_LABELS = {
  income: "Доход",
  expense: "Расход",
  transfer: "Перевод",
};


export default function TBankImport() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [accountMappings, setAccountMappings] = useState({});
  const [categoryMappings, setCategoryMappings] = useState({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setAccountMappings({});
    setCategoryMappings({});
    setConfirmed(false);
    setError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const chooseFile = (selected) => {
    if (!selected) return;
    setFile(selected);
    setPreview(null);
    setResult(null);
    setError(null);
    setConfirmed(false);
  };

  const upload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await api.post("/api/import/tbank/preview", body, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30_000,
      });
      setPreview(response.data);
      setAccountMappings(Object.fromEntries(
        response.data.source_accounts.map((item) => [
          item.source_key,
          item.mapped_account_id ?? "",
        ]),
      ));
      setCategoryMappings(Object.fromEntries(
        response.data.source_categories.map((item) => [
          item.mapping_key,
          item.mapped_category_id ?? "",
        ]),
      ));
      setConfirmed(false);
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail
        || "Не удалось прочитать выгрузку Т‑Банка",
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const normalizeMappings = (mappings) => Object.fromEntries(
        Object.entries(mappings).map(([key, value]) => [
          key,
          value === "" ? null : Number(value),
        ]),
      );
      const response = await api.post("/api/import/tbank/confirm", {
        import_token: preview.import_token,
        account_mappings: normalizeMappings(accountMappings),
        category_mappings: normalizeMappings(categoryMappings),
      }, {
        timeout: 30_000,
      });
      setResult(response.data);
      window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail
        || "Не удалось импортировать операции",
      );
    } finally {
      setImporting(false);
    }
  };

  const mappedOperations = preview
    ? preview.rows.filter((row) => {
      if (row.error || row.duplicate) return false;
      if (!accountMappings[row.source_key]) return false;
      if (row.tx_type === "transfer" && !accountMappings[row.target_source_key]) {
        return false;
      }
      return accountMappings[row.source_key] !== accountMappings[row.target_source_key];
    }).length
    : 0;

  return (
    <div className="page tbank-import-page" style={{ maxWidth: 1120 }}>
      <Link className="tbank-back-link" to="/import">← К способам импорта</Link>
      <h1>Импорт из Т‑Банка</h1>
      <p className="tbank-lead">
        В приложении Т‑Банка откройте историю операций, выберите период и
        экспортируйте CSV. CaseMoney сопоставит карты со счетами, категории —
        с вашими категориями, а переводы между своими счетами объединит.
      </p>

      {error && (
        <div className="tbank-error">
          <span>{error}</span>
          <button type="button" className="btn-ghost" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {result ? (
        <ImportResult result={result} reset={reset} navigate={navigate} />
      ) : (
        <>
          <div
            className="tbank-upload"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              chooseFile(event.dataTransfer.files?.[0]);
            }}
          >
            <div className="tbank-upload-icon">₽</div>
            <strong>{file ? file.name : "Выберите CSV Т‑Банка"}</strong>
            <span>
              {file
                ? `${(file.size / 1024).toFixed(1)} КБ · нажмите, чтобы заменить`
                : "или перетащите файл сюда"}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
          </div>

          {file && !preview && (
            <button type="button" onClick={upload} disabled={loading}>
              {loading ? "Анализируем операции…" : "Проверить файл"}
            </button>
          )}

          {preview && (
            <>
              <PreviewStats totals={preview.totals} />

              <section className="tbank-section">
                <div className="tbank-section-head">
                  <div>
                    <h2>1. Сопоставьте карты и счета</h2>
                    <p>
                      Эти настройки запомнятся. «Не импортировать» пропустит
                      операции с указанной карты.
                    </p>
                  </div>
                  <Link to="/accounts">Настроить счета</Link>
                </div>
                <div className="tbank-mapping-list">
                  {preview.source_accounts.map((source) => (
                    <MappingRow
                      key={source.source_key}
                      label={source.label}
                      hint={`${source.row_count} строк`}
                    >
                      <select
                        value={accountMappings[source.source_key] ?? ""}
                        onChange={(event) => setAccountMappings((current) => ({
                          ...current,
                          [source.source_key]: event.target.value,
                        }))}
                      >
                        <option value="">Не импортировать</option>
                        {preview.account_options.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                            {account.currencies.length
                              ? ` · ${account.currencies.join(", ")}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </MappingRow>
                  ))}
                </div>
              </section>

              <section className="tbank-section">
                <div className="tbank-section-head">
                  <div>
                    <h2>2. Сопоставьте категории</h2>
                    <p>
                      Категорию можно не выбирать — операция сохранится без неё.
                    </p>
                  </div>
                  <Link to="/settings/categories">Настроить категории</Link>
                </div>
                <div className="tbank-mapping-list">
                  {preview.source_categories.map((source) => (
                    <MappingRow
                      key={source.mapping_key}
                      label={source.source_name}
                      hint={`${TYPE_LABELS[source.tx_type]} · ${source.row_count}`}
                    >
                      <select
                        value={categoryMappings[source.mapping_key] ?? ""}
                        onChange={(event) => setCategoryMappings((current) => ({
                          ...current,
                          [source.mapping_key]: event.target.value,
                        }))}
                      >
                        <option value="">Без категории</option>
                        {preview.category_options
                          .filter((category) => category.type === source.tx_type)
                          .map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.path}
                            </option>
                          ))}
                      </select>
                    </MappingRow>
                  ))}
                </div>
              </section>

              <section className="tbank-section">
                <h2>3. Проверьте операции</h2>
                <p className="tbank-section-note">
                  Дубли не будут загружены. Перевод между своими счетами
                  показывается одной строкой вместо двух банковских.
                </p>
                <OperationPreview rows={preview.rows} />
              </section>

              <label className="tbank-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  Я проверил сопоставления. Будет импортировано операций:{" "}
                  <strong>{mappedOperations}</strong>.
                </span>
              </label>

              <div className="tbank-actions">
                <button
                  type="button"
                  onClick={confirmImport}
                  disabled={!confirmed || importing || mappedOperations === 0}
                >
                  {importing ? "Импортируем…" : `Импортировать ${mappedOperations}`}
                </button>
                <button type="button" className="btn-ghost" onClick={reset}>
                  Выбрать другой файл
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}


function PreviewStats({ totals }) {
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


function MappingRow({ label, hint, children }) {
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


function OperationPreview({ rows }) {
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


function ImportResult({ result, reset, navigate }) {
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
