import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";

const TYPE_COLOR = { income: "#15803d", expense: "#b91c1c", transfer: "#1d4ed8" };
const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" };

export default function ImportHomeMoney() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = (f) => {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const onChange = (e) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  const upload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/api/import/preview", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка обработки файла");
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const res = await api.post("/api/import/confirm", {
        import_token: preview.import_token,
      });
      setResult(res.data);
      // обновить дашборды
      window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка импорта");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/import" style={{ fontSize: 13, color: "#9f1239", textDecoration: "none" }}>
          ← К выбору источника
        </Link>
      </div>
      <h1 style={{ marginBottom: 20 }}>Импорт из HomeMoney</h1>

      {error && (
        <div style={errorBox}>
          {error}
          <button onClick={() => setError(null)} className="btn-ghost" style={{ marginLeft: "auto", padding: "2px 8px" }}>×</button>
        </div>
      )}

      {result ? (
        <div style={{
          background: "#dcfce7", border: "1px solid #15803d",
          borderRadius: 10, padding: 20,
        }}>
          <h3 style={{ marginTop: 0, color: "#15803d" }}>✓ Импорт завершён</h3>
          <div style={{ fontSize: 14, color: "#166534", marginBottom: 16 }}>
            Создано транзакций: <strong>{result.imported}</strong>
            {result.skipped > 0 && <> · пропущено: <strong>{result.skipped}</strong></>}
          </div>
          {result.errors.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <details>
                <summary style={{ cursor: "pointer", color: "#991b1b" }}>
                  Ошибки ({result.errors.length})
                </summary>
                <ul style={{ fontSize: 13 }}>
                  {result.errors.map((e, i) => (
                    <li key={i}>Строка {e.line_no}: {e.error}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => navigate("/home")}>На главную</button>
            <button className="btn-ghost" onClick={reset}>Импортировать ещё файл</button>
          </div>
        </div>
      ) : (
        <>
          {/* Upload zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "#9f1239" : "#d6d3d1"}`,
              background: dragOver ? "rgba(159, 18, 57, 0.05)" : "#faf8f3",
              borderRadius: 10,
              padding: "32px 20px",
              textAlign: "center",
              cursor: "pointer",
              marginBottom: 16,
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
            {file ? (
              <>
                <div style={{ fontWeight: 600, color: "#1c1917" }}>{file.name}</div>
                <div style={{ fontSize: 13, color: "#78716c", marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB · нажмите для замены
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, color: "#57534e" }}>
                  Перетащите CSV-файл сюда или нажмите для выбора
                </div>
                <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 6 }}>
                  Формат: iHomeMoney / HomeMoney (date;account;category;total;currency;description;transfer)
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onChange}
              style={{ display: "none" }}
            />
          </div>

          {file && !preview && (
            <button
              type="button"
              onClick={upload}
              disabled={loading}
              style={{ marginBottom: 16 }}
            >
              {loading ? "Анализируем..." : "Проанализировать"}
            </button>
          )}

          {/* Preview */}
          {preview && (
            <>
              <Summary preview={preview} />
              <h3 style={{ fontSize: 14, color: "#44403c", margin: "20px 0 10px" }}>
                Строки ({preview.rows.length})
              </h3>
              <div className="table-wrap" style={{
                background: "#fff", border: "1px solid #e7e5e0", borderRadius: 8,
                maxHeight: 400, overflowY: "auto",
              }}>
                <table style={{ minWidth: 880 }}>
                  <thead style={{ position: "sticky", top: 0, background: "#faf8f3" }}>
                    <tr>
                      <Th>#</Th>
                      <Th>Дата</Th>
                      <Th>Тип</Th>
                      <Th align="right">Сумма</Th>
                      <Th>Счёт</Th>
                      <Th>Категория</Th>
                      <Th>Описание</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr
                        key={r.line_no}
                        style={{
                          borderTop: "1px solid #ede9df",
                          background: r.error ? "#fef2f0" : "transparent",
                        }}
                      >
                        <Td style={{ color: "#a8a29e", fontSize: 12 }}>{r.line_no}</Td>
                        <Td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{r.date || "—"}</Td>
                        <Td style={{ color: TYPE_COLOR[r.tx_type], fontSize: 12, fontWeight: 600 }}>
                          {TYPE_LABEL[r.tx_type]}
                        </Td>
                        <Td align="right" style={{ fontWeight: 600, color: TYPE_COLOR[r.tx_type], whiteSpace: "nowrap" }}>
                          {r.tx_type === "expense" ? "−" : "+"}{r.abs_amount.toLocaleString("ru-RU")} {r.currency}
                        </Td>
                        <Td style={{ fontSize: 13 }}>
                          {r.account}
                          {r.transfer_to && (
                            <span style={{ color: "#a8a29e" }}> → {r.transfer_to}</span>
                          )}
                        </Td>
                        <Td style={{ fontSize: 13, color: "#78716c" }}>
                          {r.category_path || (r.transfer_to ? "перевод" : "—")}
                        </Td>
                        <Td style={{ fontSize: 13, color: "#78716c" }}>
                          {r.error
                            ? <span style={{ color: "#b91c1c" }}>⚠ {r.error}</span>
                            : (r.description || "")}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={confirm} disabled={importing || preview.totals.ok === 0}>
                  {importing ? "Импортируем..." : `Импортировать ${preview.totals.ok} записей`}
                </button>
                <button className="btn-ghost" onClick={reset}>Отмена</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Summary({ preview }) {
  const { totals, new_accounts, existing_accounts, new_categories, existing_categories, currencies_to_add } = preview;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 12,
    }}>
      <Stat label="Всего строк" value={totals.rows_total} color="#78716c" />
      <Stat label="К импорту" value={totals.ok} color="#15803d" />
      {totals.errors > 0 && <Stat label="Ошибок" value={totals.errors} color="#b91c1c" />}
      <Stat label="Переводов" value={totals.transfers} color="#1d4ed8" />
      <Stat label="Доходы" value={`+${totals.income_sum.toLocaleString("ru-RU")}`} color="#15803d" />
      <Stat label="Расходы" value={`−${totals.expense_sum.toLocaleString("ru-RU")}`} color="#b91c1c" />

      <Pills title="Новые счета" items={new_accounts} color="#15803d" />
      <Pills title="Существующие счета" items={existing_accounts} color="#78716c" />
      <Pills title="Новые категории" items={new_categories.map(c => c.name)} color="#9f1239" />
      <Pills title="Существующие категории" items={existing_categories} color="#78716c" />
      {currencies_to_add.length > 0 && (
        <Pills title="Новые валюты" items={currencies_to_add} color="#f59e0b" />
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e7e5e0", borderRadius: 8,
      padding: "10px 14px",
    }}>
      <div style={{ fontSize: 11, color: "#78716c", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function Pills({ title, items, color }) {
  if (!items?.length) return null;
  return (
    <div style={{
      background: "#fff", border: "1px solid #e7e5e0", borderRadius: 8,
      padding: "10px 14px",
    }}>
      <div style={{ fontSize: 11, color: "#78716c", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        {title} ({items.length})
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {items.slice(0, 12).map((it, i) => (
          <span key={i} style={{
            fontSize: 12, padding: "2px 8px", borderRadius: 4,
            background: color + "1a", color, fontWeight: 500,
          }}>
            {it}
          </span>
        ))}
        {items.length > 12 && (
          <span style={{ fontSize: 12, color: "#a8a29e" }}>+{items.length - 12}</span>
        )}
      </div>
    </div>
  );
}

function Th({ children, align = "left" }) {
  return (
    <th style={{
      padding: "10px 12px", textAlign: align,
      fontSize: 12, color: "#78716c", fontWeight: 600,
      background: "#faf8f3", whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
}

function Td({ children, align = "left", style = {} }) {
  return (
    <td style={{ padding: "8px 12px", textAlign: align, ...style }}>{children}</td>
  );
}

const errorBox = {
  display: "flex", alignItems: "center",
  color: "#b91c1c", padding: "10px 14px",
  background: "#fef2f0", border: "1px solid #fecdd3",
  borderRadius: 8, marginBottom: 12,
};
