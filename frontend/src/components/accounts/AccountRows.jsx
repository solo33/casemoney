import { useState, useEffect, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import api from "../../api/client";

import CategoryPicker from "../../components/CategoryPicker";
import { COMMON_CURRENCIES, currencySymbol, formatMoney, formatMoneyWithCurrency } from "../../utils/money";
const UNGROUPED_KEY = "__ungrouped__";
export function GroupBucket({
  bucket, mainCurrency, expanded, onToggleExpand,
  collapsedGroups, onToggleGroup,
  onDeleteGroup, onDeleteAccount, onToggleInclude, onToggleShowForEntries, onEditNote,
  addingCurrencyTo, setAddingCurrencyTo, currencyForm, setCurrencyForm,
  onAddCurrency, onAdjustBalance, onDeleteCurrency, onCurrencyClick,
  activeDrag,
}) {
  const groupId = bucket.group.id;
  const groupKey = groupId === null ? UNGROUPED_KEY : groupId;
  const { setNodeRef, isOver } = useDroppable({
    id: `group-${groupKey}`,
    data: { type: "group", groupKey },
  });

  const canAccept = activeDrag && activeDrag.groupKey !== groupKey;
  const dropHighlight = isOver && canAccept;
  const accountIds = bucket.accounts.map(a => a.id);
  const collapsed = collapsedGroups.has(groupKey);

  return (
    <div ref={setNodeRef} className="account-group-card" style={{
      marginBottom: 16,
      border: `1px solid ${dropHighlight ? "#173a54" : "#e4ddcd"}`,
      background: "#fffdf7",
      borderRadius: 10,
      outline: dropHighlight ? "2px solid rgba(23, 58, 84, 0.25)" : "none",
    }}>
      {/* Group header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        background: "#f6f2e9",
        borderRadius: collapsed ? 10 : "10px 10px 0 0",
        borderBottom: (!collapsed && bucket.accounts.length) ? "1px solid #e4ddcd" : "none",
      }}>
        <span
          style={{ fontWeight: 600, color: "#44403c", flex: 1, cursor: "pointer", userSelect: "none" }}
          onClick={() => onToggleGroup(groupKey)}
        >
          <span style={{ display: "inline-block", width: 14, color: "#a6afb8", fontSize: 11 }}>
            {collapsed ? "▸" : "▾"}
          </span>
          {bucket.group.name}
          <span style={{ color: "#a6afb8", fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
            ({bucket.accounts.length})
          </span>
        </span>
        <span style={{ fontWeight: 700 }}>
          {bucket.total_in_main == null ? "Нет курса" : `${formatMoney(bucket.total_in_main)} ${currencySymbol(mainCurrency)}`}
        </span>
        {groupId !== null && (
          <button className="account-group-delete btn-ghost"
            type="button"
            onClick={() => onDeleteGroup(bucket.group)}
            style={{ padding: "2px 8px", fontSize: 12, color: "#c0432b" }}
            title="Удалить группу"
          >
            ×
          </button>
        )}
      </div>

      {/* Accounts list */}
      {!collapsed && (
        bucket.accounts.length === 0 ? (
          <div style={{ padding: 16, color: "#a6afb8", fontSize: 13 }}>
            Перетащите счёт сюда
          </div>
        ) : (
          <SortableContext items={accountIds} strategy={verticalListSortingStrategy}>
            {bucket.accounts.map(acc => (
              <AccountRow
                key={acc.id}
                acc={acc}
                groupKey={groupKey}
                mainCurrency={mainCurrency}
                isExpanded={expanded.has(acc.id)}
                onToggleExpand={() => onToggleExpand(acc.id)}
                onDelete={onDeleteAccount}
                onToggleInclude={onToggleInclude}
                onToggleShowForEntries={onToggleShowForEntries}
                onEditNote={onEditNote}
                isAddingCurrency={addingCurrencyTo === acc.id}
                setAddingCurrency={(v) => setAddingCurrencyTo(v ? acc.id : null)}
                currencyForm={currencyForm}
                setCurrencyForm={setCurrencyForm}
                onAddCurrency={onAddCurrency}
                onAdjustBalance={onAdjustBalance}
                onDeleteCurrency={onDeleteCurrency}
                onCurrencyClick={onCurrencyClick}
              />
            ))}
          </SortableContext>
        )
      )}
    </div>
  );
}

export function AccountRow({
  acc, groupKey, mainCurrency,
  isExpanded, onToggleExpand,
  onDelete, onToggleInclude, onToggleShowForEntries, onEditNote,
  isAddingCurrency, setAddingCurrency,
  currencyForm, setCurrencyForm,
  onAddCurrency, onAdjustBalance, onDeleteCurrency, onCurrencyClick,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: acc.id,
    data: { type: "account", accountId: acc.id, groupKey, name: acc.name, icon: acc.icon },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : "auto",
  };

  const multiCurrency = (acc.balances || []).length > 1;
  const presentCurrencies = (acc.balances || []).map(b => b.currency);
  const availableCurrencies = COMMON_CURRENCIES.filter(c => !presentCurrencies.includes(c));

  const excluded = !acc.include_in_balance;

  return (
    <div ref={setNodeRef} style={{ ...style }}>
      {/* Main row */}
      <div className={`account-main-row${isExpanded ? " is-expanded" : ""}`} style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
        padding: "10px 14px",
        borderTop: "1px solid #ece6d8",
        background: excluded ? "#f6f2e9" : "#fff",
        opacity: excluded ? 0.75 : 1,
      }}>
        <span className="account-drag-handle"
          style={{ cursor: "grab", color: "#c7cdd3", fontSize: 16, userSelect: "none" }}
          {...listeners}
          {...attributes}
          title="Перетащите, чтобы изменить порядок или перенести в другую группу"
        >
          ⋮⋮
        </span>
        {acc.icon && <span style={{ fontSize: 18 }}>{acc.icon}</span>}
        <span style={{
          fontWeight: 500, flex: "1 1 120px", minWidth: 60, cursor: "pointer",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
              onClick={onToggleExpand}>
          <span style={{ display: "inline-block", width: 12, color: "#a6afb8", fontSize: 11 }}>
            {isExpanded ? "▾" : "▸"}
          </span>
          {acc.name}
          {excluded && (
            <span style={{
              marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 4,
              background: "#f4ead3", color: "#846630",
              textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600,
              verticalAlign: "middle",
            }}>
              не в балансе
            </span>
          )}
          {multiCurrency && (
            <span style={{ marginLeft: 6, color: "#a6afb8", fontSize: 12 }}>
              {acc.balances.length} валют
            </span>
          )}
        </span>
        <span style={{
          fontWeight: 700, fontSize: 15,
          color: excluded ? "#a6afb8" : (acc.color || "#1b2531"),
          textDecoration: excluded ? "line-through" : "none",
        }}>
          {acc.total_in_main == null ? "Нет курса" : `${formatMoney(acc.total_in_main)} ${currencySymbol(mainCurrency)}`}
        </span>
        {/* Кнопки — единый блок: при нехватке места переносится целиком,
            а не по одной кнопке (× не должен оказываться на своей строке) */}
        <div className="account-row-actions" style={{ display: "flex", gap: 10, flexShrink: 0, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => onToggleInclude(acc)}
            className="btn-ghost"
            style={{ padding: "3px 8px", fontSize: 12 }}
            title={excluded ? "Включить в общий баланс" : "Исключить из общего баланса"}
          >
            {excluded ? "↑ в баланс" : "↓ из баланса"}
          </button>
          <button
            type="button"
            onClick={() => onToggleShowForEntries(acc)}
            className="btn-ghost"
            style={{ padding: "3px 8px", fontSize: 12 }}
            title={acc.show_for_entries ? "Скрыть в формах записей" : "Показывать в формах записей"}
          >
          {acc.show_for_entries ? "✓ для записей" : "○ для записей"}
          </button>
          <button
            type="button"
            onClick={() => onEditNote(acc)}
            className="btn-ghost"
            style={{ padding: "3px 8px", fontSize: 12 }}
            title={acc.note || "Добавить комментарий к счёту"}
          >
            {acc.note ? "✎ комментарий" : "+ комментарий"}
          </button>
          <button
            type="button"
            onClick={() => setAddingCurrency(!isAddingCurrency)}
            className="btn-ghost"
            style={{ padding: "3px 8px", fontSize: 12 }}
            title="Добавить валюту"
          >
            + валюта
          </button>
          <button
            type="button"
            onClick={() => onDelete(acc)}
            className="btn-ghost"
            style={{ padding: "2px 8px", fontSize: 14, color: "#c0432b" }}
            title="Удалить счёт"
          >
            ×
          </button>
        </div>
      </div>

      {/* Balances detail */}
      {isExpanded && (acc.balances || []).length > 0 && (
        <div className="account-balances-list" style={{ padding: "0 14px 8px 44px" }}>
          {acc.balances.map(b => (
            <BalanceRow
              key={b.currency}
              balance={b}
              mainCurrency={mainCurrency}
              canDelete={acc.balances.length > 1}
              onAdjust={() => onAdjustBalance(acc, b)}
              onHistory={() => onCurrencyClick(acc.id, b.currency)}
              onDelete={() => onDeleteCurrency(acc, b)}
            />
          ))}
        </div>
      )}

      {/* Add currency form */}
      {isAddingCurrency && (
        <form onSubmit={(e) => onAddCurrency(e, acc)} style={{
          display: "flex", gap: 6, padding: "0 14px 12px 44px", alignItems: "center",
        }}>
          <select
            value={currencyForm.currency}
            onChange={e => setCurrencyForm({ ...currencyForm, currency: e.target.value })}
            style={{ fontSize: 13 }}
          >
            {availableCurrencies.length > 0
              ? availableCurrencies.map(c => <option key={c} value={c}>{c}</option>)
              : COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)
            }
          </select>
          <input
            type="number"
            step="0.01"
            placeholder="0"
            value={currencyForm.balance}
            onChange={e => setCurrencyForm({ ...currencyForm, balance: e.target.value })}
            style={{ width: 120, fontSize: 13 }}
          />
          <button type="submit" style={{ fontSize: 13, padding: "4px 10px" }}>Добавить</button>
          <button
            type="button"
            onClick={() => setAddingCurrency(false)}
            className="btn-ghost"
            style={{ fontSize: 13, padding: "4px 10px" }}
          >
            Отмена
          </button>
        </form>
      )}
    </div>
  );
}

function BalanceRow({
  balance,
  mainCurrency,
  canDelete,
  onAdjust,
  onHistory,
  onDelete,
}) {
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

  const openAdjustment = event => {
    event.stopPropagation();
    setMenuOpen(false);
    onAdjust();
  };

  const openHistory = event => {
    event.stopPropagation();
    setMenuOpen(false);
    onHistory();
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
      onClick={() => {
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
          {balance.balance_in_main == null ? "Нет курса" : `≈ ${formatMoney(balance.balance_in_main)} ${currencySymbol(mainCurrency)}`}
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
      {canDelete && (
        <button
          type="button"
          onClick={event => { event.stopPropagation(); onDelete(); }}
          className="balance-delete-currency btn-ghost"
          aria-label={`Удалить валюту ${balance.currency}`}
        >
          ×
        </button>
      )}

      {menuOpen && (
        <>
          <button
            type="button"
            className="balance-menu-backdrop"
            aria-label="Закрыть меню остатка"
            onClick={event => { event.stopPropagation(); setMenuOpen(false); }}
          />
          <div className="balance-context-menu" role="menu">
            <button type="button" role="menuitem" onClick={openAdjustment}>
              Скорректировать
            </button>
            <button type="button" role="menuitem" onClick={openHistory}>
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
      await api.post(
        `/api/accounts/${account.id}/balances/${balance.currency}/adjust`,
        {
          balance: numericBalance,
          category_id: categoryId ? Number.parseInt(categoryId, 10) : null,
        },
      );
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
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={desiredBalance}
              onChange={event => setDesiredBalance(event.target.value)}
              autoFocus
              required
            />
            <small>{balance.currency}</small>
          </label>
          <label>
            <span>Категория</span>
            <CategoryPicker
              categories={availableCategories}
              value={categoryId}
              onChange={setCategoryId}
              placeholder="— не выбрана —"
            />
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
