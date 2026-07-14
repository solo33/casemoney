import { useState, useEffect, useCallback } from "react";
import api from "../api/client";
import { useUser } from "../contexts/UserContext";
import { COMMON_CURRENCIES, currencySymbol } from "../utils/money";
import SettingsTabs from "../components/SettingsTabs";

// Полные русские названия некоторых валют (опционально)
const NAMES = {
  RUB: "Российский рубль",
  USD: "Доллар США",
  EUR: "Евро",
  GBP: "Фунт стерлингов",
  UAH: "Гривна",
  KZT: "Тенге",
  BYN: "Белорусский рубль",
  CNY: "Юань",
  JPY: "Иена",
  BTC: "Bitcoin",
  ETH: "Etherium",
  USDT: "Tether USD",
  USDC: "USD Coin",
  BNB: "BNB",
  SOL: "Solana",
  TON: "Toncoin",
};

export default function Currencies() {
  const { mainCurrency, updateMainCurrency } = useUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newCurrency, setNewCurrency] = useState("");
  const [savingId, setSavingId] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const res = await api.get("/api/currencies/");
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка загрузки валют");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchAll(); }, [mainCurrency, fetchAll]);

  const handleChangeMain = async (e) => {
    const cur = e.target.value;
    try {
      await updateMainCurrency(cur);
      // POST /api/currencies на случай если новой main ещё нет в списке user_currencies
      try { await api.post("/api/currencies/", { currency: cur }); } catch { /* уже есть */ }
      fetchAll();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось обновить");
    }
  };

  const saveItem = async (uc, patch) => {
    setSavingId(uc.id);
    try {
      await api.patch(`/api/currencies/${uc.id}`, patch);
      await fetchAll();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка сохранения");
    } finally {
      setSavingId(null);
    }
  };

  const deleteItem = async (uc) => {
    if (uc.currency === data.main_currency) {
      setError("Нельзя удалить основную валюту");
      return;
    }
    if (!confirm(`Удалить валюту ${uc.currency} из списка?`)) return;
    try {
      await api.delete(`/api/currencies/${uc.id}`);
      fetchAll();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось удалить");
    }
  };

  const addCurrency = async () => {
    if (!newCurrency) return;
    try {
      await api.post("/api/currencies/", {
        currency: newCurrency,
        display_name: NAMES[newCurrency] || newCurrency,
      });
      setNewCurrency("");
      fetchAll();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось добавить");
    }
  };

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
          gridTemplateColumns: "1.7fr 70px 100px 1.4fr 60px",
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

function CurrencyRow({ uc, mainCurrency, onSave, onDelete, saving }) {
  const [displayName, setDisplayName] = useState(uc.display_name || "");
  const [shortCode, setShortCode] = useState(uc.short_code || uc.currency);
  const [rateInput, setRateInput] = useState(String(uc.effective_rate));
  const isMain = uc.currency === mainCurrency;

  // Когда uc обновится извне, синхронизируем поля
  useEffect(() => {
    setDisplayName(uc.display_name || "");
    setShortCode(uc.short_code || uc.currency);
    setRateInput(String(uc.effective_rate));
  }, [uc.id, uc.currency, uc.effective_rate, uc.display_name, uc.short_code]);

  const handleBlurName = () => {
    if (displayName !== (uc.display_name || "")) {
      onSave({ display_name: displayName || null });
    }
  };
  const handleBlurShort = () => {
    if (shortCode !== (uc.short_code || uc.currency)) {
      onSave({ short_code: shortCode || null });
    }
  };
  const handleToggleAuto = (e) => {
    const auto = e.target.checked;
    const patch = { auto };
    // Если выключили auto и manual_rate ещё не задан — сохраняем текущий effective_rate как manual
    if (!auto && (uc.manual_rate === null || uc.manual_rate === undefined)) {
      patch.manual_rate = uc.effective_rate;
    }
    onSave(patch);
  };
  const handleBlurRate = () => {
    if (uc.auto) return;
    const num = parseFloat(rateInput.replace(",", "."));
    if (Number.isNaN(num) || num <= 0) {
      setRateInput(String(uc.effective_rate));
      return;
    }
    if (num !== uc.manual_rate) {
      onSave({ manual_rate: num });
    }
  };

  return (
    <div className="cur-row-grid" style={{
      display: "grid",
      gridTemplateColumns: "1.7fr 70px 100px 1.4fr 60px",
      gap: 12, alignItems: "center",
      padding: "8px 4px",
      borderBottom: "1px solid #f6f2e9",
      opacity: saving ? 0.6 : 1,
    }}>
      <div>
        <span className="cur-field-label" style={mobileLabelStyle}>Наименование</span>
        <input
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          onBlur={handleBlurName}
          placeholder={uc.currency}
          style={{ fontSize: 14, width: "100%" }}
        />
      </div>
      <div>
        <span className="cur-field-label" style={mobileLabelStyle}>ISO</span>
        <span style={{ color: "#7a8590", fontSize: 13, fontWeight: 600 }}>{uc.currency}</span>
      </div>
      <div>
        <span className="cur-field-label" style={mobileLabelStyle}>Сокращение</span>
        <input
          type="text"
          value={shortCode}
          onChange={e => setShortCode(e.target.value)}
          onBlur={handleBlurShort}
          maxLength={10}
          style={{ fontSize: 13, width: "100%" }}
        />
      </div>

      {/* Курс */}
      <div>
        <span className="cur-field-label" style={mobileLabelStyle}>Курс</span>
        {isMain ? (
          <span style={{ color: "#a6afb8", fontSize: 13 }}>—</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "#7a8590", whiteSpace: "nowrap" }}>1 {uc.currency} =</span>
            <input
              type="text"
              value={rateInput}
              onChange={e => setRateInput(e.target.value)}
              onBlur={handleBlurRate}
              disabled={uc.auto}
              style={{
                width: 120, fontSize: 13,
                color: uc.auto ? "#2f6296" : "#1b2531",
                background: uc.auto ? "#ece6d8" : "#fff",
                textDecoration: uc.auto ? "underline" : "none",
                cursor: uc.auto ? "default" : "text",
              }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 4, color: "#515c68", fontSize: 12 }}>
              <input
                type="checkbox"
                checked={uc.auto}
                onChange={handleToggleAuto}
                style={{ width: 16, height: 16 }}
              />
              Авто
            </label>
          </div>
        )}
      </div>

      {!isMain && (
        <button
          type="button"
          onClick={onDelete}
          className="btn-ghost"
          style={{ padding: "2px 8px", fontSize: 14, color: "#c0432b" }}
          title="Удалить"
        >
          × Удалить
        </button>
      )}
    </div>
  );
}

const mobileLabelStyle = {
  display: "none",
  fontSize: 11, color: "#a6afb8", textTransform: "uppercase",
  letterSpacing: 0.4, marginBottom: 2,
};
