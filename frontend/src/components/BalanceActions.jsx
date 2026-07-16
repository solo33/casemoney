import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import CategoryPicker from "./CategoryPicker";
import { currencySymbol, formatMoney, formatMoneyWithCurrency } from "../utils/money";

export function BalanceActionRow({ balance, mainCurrency, onAdjust, onHistory }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef(null);
  const longPressed = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  useEffect(() => clearLongPress, []);

  const startLongPress = event => {
    if (event.pointerType !== "touch" && !window.matchMedia("(max-width: 767px)").matches) return;
    clearLongPress();
    longPressed.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setMenuOpen(true);
      if (navigator.vibrate) navigator.vibrate(25);
    }, 550);
  };

  return (
    <div
      className="account-balance-row"
      onPointerDown={startLongPress}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
      onContextMenu={event => {
        if (!window.matchMedia("(max-width: 767px)").matches) return;
        event.preventDefault();
        setMenuOpen(true);
      }}
      onClick={event => {
        event.stopPropagation();
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onHistory();
      }}
      aria-label={`Остаток ${balance.currency}. Нажмите для просмотра истории`}
    >
      <span className="account-balance-currency">{balance.currency}</span>
      <span className="account-balance-amount">
        {formatMoneyWithCurrency(balance.balance, balance.currency)}
      </span>
      {balance.currency !== mainCurrency && (
        <span className="account-balance-equivalent">
          ≈ {formatMoney(balance.balance_in_main)} {currencySymbol(mainCurrency)}
        </span>
      )}
      <button
        type="button"
        className="balance-action-trigger btn-ghost"
        onClick={event => {
          event.stopPropagation();
          setMenuOpen(value => !value);
        }}
        aria-label={`Действия с остатком ${balance.currency}`}
        aria-expanded={menuOpen}
      >
        ▾
      </button>

      {menuOpen && (
        <>
          <button
            type="button"
            className="balance-menu-backdrop"
            aria-label="Закрыть меню остатка"
            onClick={event => { event.stopPropagation(); setMenuOpen(false); }}
          />
          <div className="balance-context-menu" role="menu">
            <button type="button" role="menuitem" onClick={event => {
              event.stopPropagation();
              setMenuOpen(false);
              onAdjust();
            }}>
              Скорректировать
            </button>
            <button type="button" role="menuitem" onClick={event => {
              event.stopPropagation();
              setMenuOpen(false);
              onHistory();
            }}>
              Просмотреть историю
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function BalanceAdjustmentModal({ account, balance, onClose, onSaved }) {
  const [desiredBalance, setDesiredBalance] = useState(String(balance.balance));
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const numericBalance = Number.parseFloat(desiredBalance);
  const difference = Number.isFinite(numericBalance)
    ? Math.round((numericBalance - balance.balance) * 100) / 100
    : 0;
  const adjustmentType = difference >= 0 ? "income" : "expense";
  const availableCategories = categories.filter(category => category.type === adjustmentType);

  useEffect(() => {
    api.get("/api/categories/")
      .then(response => setCategories(response.data || []))
      .catch(() => setError("Не удалось загрузить категории"));
  }, []);

  useEffect(() => {
    if (!categoryId) return;
    const selected = categories.find(category => String(category.id) === String(categoryId));
    if (selected && selected.type !== adjustmentType) setCategoryId("");
  }, [adjustmentType, categories, categoryId]);

  const submit = async event => {
    event.preventDefault();
    if (!Number.isFinite(numericBalance)) {
      setError("Введите корректный остаток");
      return;
    }
    if (Math.abs(difference) < 0.005) {
      setError("Новый остаток совпадает с текущим");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/accounts/${account.id}/balances/${balance.currency}/adjust`, {
        balance: numericBalance,
        category_id: categoryId ? Number.parseInt(categoryId, 10) : null,
      });
      onSaved();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось скорректировать остаток");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="balance-adjustment-backdrop" onClick={onClose}>
      <form className="balance-adjustment-modal" onSubmit={submit} onClick={event => event.stopPropagation()}>
        <div className="balance-adjustment-head">
          <h3>Корректировка остатка</h3>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="balance-adjustment-grid">
          <label>
            <span>На счёте</span>
            <input value={account.name} disabled />
            <small>{balance.currency}</small>
          </label>
          <label>
            <span>Должно остаться</span>
            <input type="number" inputMode="decimal" step="0.01" value={desiredBalance}
              onChange={event => setDesiredBalance(event.target.value)} autoFocus required />
            <small>{balance.currency}</small>
          </label>
          <label>
            <span>Категория</span>
            <CategoryPicker categories={availableCategories} value={categoryId}
              onChange={setCategoryId} placeholder="— не выбрана —" />
          </label>
          <div className="balance-adjustment-difference">
            <span>Запись</span>
            <strong className={difference >= 0 ? "is-income" : "is-expense"}>
              {difference > 0 ? "+" : ""}{formatMoney(difference)} {balance.currency}
            </strong>
            <small>{difference >= 0 ? "Доход" : "Расход"}</small>
          </div>
        </div>
        {error && <div className="balance-adjustment-error">{error}</div>}
        <div className="balance-adjustment-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Отменить</button>
          <button type="submit" disabled={saving || Math.abs(difference) < 0.005}>
            {saving ? "Корректируем…" : "Скорректировать"}
          </button>
        </div>
      </form>
    </div>
  );
}
