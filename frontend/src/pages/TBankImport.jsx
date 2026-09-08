
import { Link } from "react-router-dom";
import { useTBankImportController } from "../hooks/useTBankImportController";
import { ImportResult, PreviewStats, MappingRow, OperationPreview } from "../components/tBankImport/TBankImportParts";
import { TYPE_LABELS } from "../utils/tBankImportView";

export default function TBankImport() {
  const { navigate, inputRef, file, preview, accountMappings, setAccountMappings, categoryMappings, setCategoryMappings, loading, importing, confirmed, setConfirmed, error, setError, result, reset, chooseFile, upload, confirmImport, mappedOperations } = useTBankImportController();
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
