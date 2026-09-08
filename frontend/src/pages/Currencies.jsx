
import { COMMON_CURRENCIES, currencySymbol } from "../utils/money";
import SettingsTabs from "../components/SettingsTabs";

import { useCurrenciesController } from "../hooks/useCurrenciesController";
import { CurrencyRow } from "../components/currencies/CurrenciesParts";
import { NAMES } from "../utils/currenciesView";

export default function Currencies() {
  const { data, loading, error, setError, newCurrency, setNewCurrency, savingId, handleChangeMain, saveItem, deleteItem, addCurrency } = useCurrenciesController();
  if (loading) return <div className="page">Загрузка...</div>;
  if (!data) return <div className="page" style={{ color: "#c0432b" }}>{error || "Нет данных"}</div>;

  const presentCodes = data.currencies.map(c => c.currency);
  const addable = COMMON_CURRENCIES.filter(c => !presentCodes.includes(c));

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <h1 style={{ marginBottom: 20 }}>Валюты</h1>
      <SettingsTabs />

      {error && (
        <div style={{
          color: "#c0432b", marginBottom: 12, padding: "8px 12px",
          background: "#fef2f0", border: "1px solid #fecdd3", borderRadius: 8,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="btn-ghost" style={{ padding: "2px 8px" }}>×</button>
        </div>
      )}

      <div style={{
        background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
        padding: 20,
      }}>
        {/* Основная валюта */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          paddingBottom: 16, marginBottom: 16,
          borderBottom: "1px solid #ece6d8",
        }}>
          <span style={{ color: "#515c68", fontSize: 14 }}>Основная валюта</span>
          <select
            value={data.main_currency}
            onChange={handleChangeMain}
            style={{ fontSize: 14, fontWeight: 600 }}
          >
            {[...new Set([data.main_currency, ...COMMON_CURRENCIES])].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span style={{ color: "#a6afb8", fontSize: 12 }}>
            Все суммы в дашбордах будут пересчитаны в эту валюту.
          </span>
        </div>

        {/* Шапка таблицы */}
        <div className="cur-head" style={{
          display: "grid",
          gridTemplateColumns: "1.7fr 70px 100px 1.4fr 52px",
          gap: 12, alignItems: "center",
          fontSize: 12, color: "#a6afb8", textTransform: "uppercase",
          letterSpacing: 0.5, marginBottom: 8, padding: "0 4px",
        }}>
          <span>Наименование</span>
          <span>ISO</span>
          <span>Сокращение</span>
          <span>Курс</span>
          <span></span>
        </div>
        <style>{`
          @media (max-width: 640px) {
            .cur-head { display: none !important; }
            .cur-row-grid { grid-template-columns: 1fr !important; gap: 4px !important; padding: 10px 4px !important; }
            .cur-field-label { display: block !important; }
            .cur-row-grid > button { justify-self: end; }
          }
        `}</style>

        {/* Список валют */}
        {data.currencies.map(uc => (
          <CurrencyRow
            key={uc.id}
            uc={uc}
            mainCurrency={data.main_currency}
            onSave={(patch) => saveItem(uc, patch)}
            onDelete={() => deleteItem(uc)}
            saving={savingId === uc.id}
          />
        ))}

        {/* Добавление валюты */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          marginTop: 16, paddingTop: 16,
          borderTop: "1px solid #ece6d8",
        }}>
          <span style={{ color: "#515c68", fontSize: 14 }}>Добавить валюту</span>
          <select
            value={newCurrency}
            onChange={e => setNewCurrency(e.target.value)}
            style={{ flex: 1, maxWidth: 260 }}
          >
            <option value="">Не выбрана валюта…</option>
            {addable.map(c => (
              <option key={c} value={c}>
                {currencySymbol(c)} {c} — {NAMES[c] || c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addCurrency}
            disabled={!newCurrency}
            style={{ opacity: newCurrency ? 1 : 0.5 }}
          >
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
