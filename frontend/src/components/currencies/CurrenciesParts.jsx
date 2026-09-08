import { useState, useEffect } from "react";

import { mobileLabelStyle } from "../../utils/currenciesView";

export function CurrencyRow({ uc, mainCurrency, onSave, onDelete, saving }) {
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
      gridTemplateColumns: "1.7fr 70px 100px 1.4fr 52px",
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
          style={{ width: 44, height: 44, padding: 0, color: "#c0432b", display: "grid", placeItems: "center" }}
          title="Удалить"
          aria-label={`Удалить валюту ${uc.currency}`}
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

export function TrashIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}
