
import { Link } from "react-router-dom";
import { useImportFileController } from "../hooks/useImportFileController";
import { errorBox, TYPE_COLOR, TYPE_LABEL } from "../utils/importFileView";
import { Summary, Th, Td } from "../components/importFile/ImportFileParts";

export default function ImportFile() {
  const { navigate, file, preview, loading, importing, error, setError, result, dragOver, setDragOver, confirmed, setConfirmed, inputRef, reset, onDrop, onChange, upload, confirm } = useImportFileController();
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/transactions" style={{ fontSize: 13, color: "#173a54", textDecoration: "none" }}>
          ← К записям
        </Link>
      </div>
      <h1 style={{ marginBottom: 8 }}>Импорт из CSV или Excel</h1>
      <p style={{ color: "#7a8590", fontSize: 14, marginBottom: 8, maxWidth: 760 }}>
        Загрузите файл с операциями. Перед сохранением мы просканируем строки и покажем,
        какие счета, категории и валюты будут созданы. Ожидаемая структура колонок:
      </p>
      <code style={{
        display: "block", maxWidth: 760, overflowX: "auto", whiteSpace: "nowrap",
        background: "#efe9db", border: "1px solid #e4ddcd", borderRadius: 6,
        padding: "8px 12px", fontSize: 12.5, color: "#515c68", marginBottom: 20,
      }}>
        date;account;category;amount;currency;description;transfer
      </code>
      <p style={{ color: "#7a8590", fontSize: 13, marginTop: -10, marginBottom: 20, maxWidth: 760 }}>
        CSV может быть разделен точкой с запятой или запятой. В Excel используется первый лист.
        Колонка <strong>transfer</strong> необязательна: если она заполнена, строка будет импортирована как перевод между счетами.
      </p>

      {error && (
        <div style={errorBox}>
          {error}
          <button onClick={() => setError(null)} className="btn-ghost" style={{ marginLeft: "auto", padding: "2px 8px" }}>×</button>
        </div>
      )}

      {result ? (
        <div style={{
          background: "#dcfce7", border: "1px solid #167a4a",
          borderRadius: 10, padding: 20,
        }}>
          <h3 style={{ marginTop: 0, color: "#167a4a" }}>✓ Импорт завершён</h3>
          <div style={{ fontSize: 14, color: "#166534", marginBottom: 16 }}>
            Создано транзакций: <strong>{result.imported}</strong>
            {result.skipped > 0 && <> · пропущено: <strong>{result.skipped}</strong></>}
          </div>
          {result.errors.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <details>
                <summary style={{ cursor: "pointer", color: "#a53825" }}>
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
              border: `2px dashed ${dragOver ? "#173a54" : "#c7cdd3"}`,
              background: dragOver ? "rgba(23, 58, 84, 0.05)" : "#f6f2e9",
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
                <div style={{ fontWeight: 600, color: "#1b2531" }}>{file.name}</div>
                <div style={{ fontSize: 13, color: "#7a8590", marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB · нажмите для замены
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, color: "#515c68" }}>
                  Перетащите CSV/XLSX/XLS-файл сюда или нажмите для выбора
                </div>
                <div style={{ fontSize: 12, color: "#a6afb8", marginTop: 6 }}>
                  Формат: date;account;category;amount;currency;description;transfer
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
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
              <label style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                background: "#fffdf7",
                border: "1px solid #e4ddcd",
                borderRadius: 8,
                padding: 12,
                marginTop: 16,
                fontSize: 13,
                color: "#515c68",
              }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  Я проверил найденные счета, категории и валюты. Можно создавать недостающие элементы
                  и импортировать операции.
                </span>
              </label>
              <h3 style={{ fontSize: 14, color: "#44403c", margin: "20px 0 10px" }}>
                Строки ({preview.rows.length})
              </h3>
              <div className="table-wrap" style={{
                background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 8,
                maxHeight: 400, overflowY: "auto",
              }}>
                <table style={{ minWidth: 880 }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f6f2e9" }}>
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
                          borderTop: "1px solid #ece6d8",
                          background: r.error ? "#fef2f0" : "transparent",
                        }}
                      >
                        <Td style={{ color: "#a6afb8", fontSize: 12 }}>{r.line_no}</Td>
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
                            <span style={{ color: "#a6afb8" }}> → {r.transfer_to}</span>
                          )}
                        </Td>
                        <Td style={{ fontSize: 13, color: "#7a8590" }}>
                          {r.category_path || (r.transfer_to ? "перевод" : "—")}
                        </Td>
                        <Td style={{ fontSize: 13, color: "#7a8590" }}>
                          {r.error
                            ? <span style={{ color: "#c0432b" }}>⚠ {r.error}</span>
                            : (r.description || "")}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={confirm} disabled={importing || preview.totals.ok === 0 || !confirmed}>
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
