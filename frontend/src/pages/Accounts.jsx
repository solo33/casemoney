import { useState, useEffect, useCallback, useRef } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useUser } from "../contexts/UserContext";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import CategoryPicker from "../components/CategoryPicker";
import { COMMON_CURRENCIES, currencySymbol, formatMoney, formatMoneyWithCurrency } from "../utils/money";

const ACCOUNT_TYPES = [
  { value: "cash",   label: "Наличные" },
  { value: "card",   label: "Карта" },
  { value: "bank",   label: "Банк" },
  { value: "crypto", label: "Крипто" },
];

const UNGROUPED_KEY = "__ungrouped__";

export default function Accounts() {
  const navigate = useNavigate();
  const { mainCurrency, user } = useUser();
  const [groups, setGroups] = useState([]);  // grouped response
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());  // group keys свёрнутые

  // Forms / state
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: "", type: "cash", color: "", icon: "",
    initial_currency: "RUB", initial_balance: 0,
    group_id: "",
    include_in_balance: true,
    show_for_entries: true,
  });
  const [expanded, setExpanded] = useState(new Set());        // account ids with expanded balances
  const [addingCurrencyTo, setAddingCurrencyTo] = useState(null);  // account.id
  const [currencyForm, setCurrencyForm] = useState({ currency: "USD", balance: 0 });
  const [activeDrag, setActiveDrag] = useState(null);
  const [adjustingBalance, setAdjustingBalance] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const fetchGroups = useCallback(async () => {
    try {
      const res = await api.get("/api/accounts/grouped");
      setGroups(res.data);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка загрузки счетов");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener(TX_ADDED_EVENT, fetchGroups);
    return () => window.removeEventListener(TX_ADDED_EVENT, fetchGroups);
  }, [fetchGroups]);

  // Загружаем один раз при открытии и повторяем при смене основной валюты.
  // Раньше соседний effect запускал второй одинаковый запрос при каждом mount.
  useEffect(() => { fetchGroups(); }, [mainCurrency, fetchGroups]);

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleGroup = (groupKey) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  };

  const goToAccountCurrency = (accId, currency) => {
    navigate(`/transactions?account_id=${accId}&currency=${currency}`);
  };

  // --- Group ops ---

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      await api.post("/api/account-groups/", { name: newGroupName.trim(), sort_order: groups.length });
      setNewGroupName("");
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка создания группы");
    }
  };

  const handleDeleteGroup = async (group) => {
    if (!group.id) return;  // virtual ungrouped
    if (!confirm(`Удалить группу «${group.name}»? Счета останутся (без группы).`)) return;
    try {
      await api.delete(`/api/account-groups/${group.id}`);
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось удалить группу");
    }
  };

  // --- Account ops ---

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newAccount,
        group_id: newAccount.group_id ? parseInt(newAccount.group_id) : null,
      };
      if (!payload.color) delete payload.color;
      if (!payload.icon) delete payload.icon;
      payload.initial_balance = parseFloat(payload.initial_balance) || 0;
      await api.post("/api/accounts/", payload);
      setShowNewAccount(false);
      setNewAccount({
        name: "", type: "cash", color: "", icon: "",
        initial_currency: "RUB", initial_balance: 0, group_id: "",
        include_in_balance: true,
        show_for_entries: true,
      });
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка создания счёта");
    }
  };

  const handleDeleteAccount = async (acc) => {
    if (!confirm(`Удалить счёт «${acc.name}»? Все балансы и транзакции этого счёта будут потеряны.`)) return;
    try {
      await api.delete(`/api/accounts/${acc.id}`);
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось удалить счёт");
    }
  };

  const handleToggleInclude = async (acc) => {
    const includeInBalance = !acc.include_in_balance;
    const updateLocalValue = (value) => {
      setGroups(current => current.map(bucket => ({
        ...bucket,
        accounts: bucket.accounts.map(account => (
          account.id === acc.id
            ? { ...account, include_in_balance: value }
            : account
        )),
      })));
    };
    updateLocalValue(includeInBalance);
    try {
      await api.put(`/api/accounts/${acc.id}`, { include_in_balance: includeInBalance });
      setError(null);
    } catch (e) {
      updateLocalValue(acc.include_in_balance);
      setError(e.response?.data?.detail || "Не удалось обновить");
    }
  };

  const handleToggleShowForEntries = async (acc) => {
    const showForEntries = !acc.show_for_entries;
    const updateLocalValue = (value) => {
      setGroups(current => current.map(bucket => ({
        ...bucket,
        accounts: bucket.accounts.map(account => (
          account.id === acc.id
            ? { ...account, show_for_entries: value }
            : account
        )),
      })));
    };
    updateLocalValue(showForEntries);
    try {
      await api.put(`/api/accounts/${acc.id}`, { show_for_entries: showForEntries });
      setError(null);
    } catch (e) {
      updateLocalValue(acc.show_for_entries);
      setError(e.response?.data?.detail || "Не удалось обновить видимость счёта");
    }
  };

  // --- Currency ops ---

  const handleAddCurrency = async (e, acc) => {
    e.preventDefault();
    try {
      await api.post(`/api/accounts/${acc.id}/balances`, {
        currency: currencyForm.currency,
        balance: parseFloat(currencyForm.balance) || 0,
      });
      setAddingCurrencyTo(null);
      setCurrencyForm({ currency: "USD", balance: 0 });
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось добавить валюту");
    }
  };

  const handleDeleteCurrency = async (acc, bal) => {
    if (Math.abs(bal.balance) > 0.005) {
      setError(`Сначала обнулите баланс ${bal.currency} (сейчас ${bal.balance})`);
      return;
    }
    if (!confirm(`Удалить валюту ${bal.currency} у счёта «${acc.name}»?`)) return;
    try {
      await api.delete(`/api/accounts/${acc.id}/balances/${bal.currency}`);
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось удалить валюту");
    }
  };

  // --- DnD ---

  const handleDragStart = (event) => {
    setActiveDrag(event.active.data.current);
  };

  const bucketKey = (b) => (b.group.id ?? UNGROUPED_KEY);

  const handleDragEnd = async (event) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const dragged = active.data.current;        // { type:'account', accountId, groupKey }
    const overData = over.data.current;
    if (!dragged || !overData) return;

    // Целевая группа: либо группа счёта-цели, либо сам droppable группы
    const targetKey = overData.type === "group" ? overData.groupKey : overData.groupKey;
    const sameGroup = dragged.groupKey === targetKey;

    const targetBucket = groups.find(b => bucketKey(b) === targetKey);
    if (!targetBucket) return;
    const targetIds = targetBucket.accounts.map(a => a.id);

    // Индекс вставки
    let insertIdx;
    if (overData.type === "account") {
      insertIdx = targetIds.indexOf(overData.accountId);
      if (insertIdx < 0) insertIdx = targetIds.length;
    } else {
      insertIdx = targetIds.length; // дроп на пустую область группы → в конец
    }

    let newOrder;
    if (sameGroup) {
      const oldIdx = targetIds.indexOf(dragged.accountId);
      if (oldIdx < 0 || oldIdx === insertIdx) return;
      newOrder = arrayMove(targetIds, oldIdx, insertIdx);
    } else {
      newOrder = [...targetIds];
      newOrder.splice(insertIdx, 0, dragged.accountId);
    }

    const body = { account_ids: newOrder };
    if (!sameGroup) body.group_id = targetKey === UNGROUPED_KEY ? null : targetKey;

    try {
      await api.post("/api/accounts/reorder", body);
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось изменить порядок");
      fetchGroups();
    }
  };

  // Итог группы (g.total_in_main) включает счета «не в балансе» — для общего
  // баланса берём только учитываемые счета, как на дашборде.
  const grandTotal = groups.reduce(
    (s, g) => s + (g.accounts || [])
      .filter(a => a.include_in_balance !== false)
      .reduce((x, a) => x + (a.total_in_main || 0), 0),
    0,
  );

  if (loading) return <div className="page">Загрузка...</div>;

  return (
    <div className="page">
      {/* Header: общий баланс + действия */}
      <div className="accounts-toolbar" style={{
        display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
        marginBottom: 20,
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13, color: "#7a8590" }}>Общий баланс</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#173a54" }}>
            {formatMoney(grandTotal)} {currencySymbol(mainCurrency)}
          </div>
        </div>

        <form className="accounts-new-group" onSubmit={handleCreateGroup} style={{ display: "flex", gap: 6 }}>
          <input
            placeholder="Новая группа"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            style={{ width: 180 }}
          />
          <button type="submit">+ Группа</button>
        </form>

        {user?.plan === "family" && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigate("/credits")}
          >
            Обязательства и депозиты
          </button>
        )}

        <button onClick={() => setShowNewAccount(s => !s)} type="button">
          {showNewAccount ? "Отмена" : "+ Счёт"}
        </button>
      </div>

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

      {/* Форма создания счёта */}
      {showNewAccount && (
        <form onSubmit={handleCreateAccount} style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
          padding: 16, marginBottom: 20,
          display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        }}>
          <input
            placeholder="Название"
            value={newAccount.name}
            onChange={e => setNewAccount({ ...newAccount, name: e.target.value })}
            required
            autoFocus
          />
          <select
            value={newAccount.type}
            onChange={e => setNewAccount({ ...newAccount, type: e.target.value })}
          >
            {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            value={newAccount.group_id}
            onChange={e => setNewAccount({ ...newAccount, group_id: e.target.value })}
          >
            <option value="">— Без группы —</option>
            {groups.filter(g => g.group.id !== null).map(g => (
              <option key={g.group.id} value={g.group.id}>{g.group.name}</option>
            ))}
          </select>
          <select
            value={newAccount.initial_currency}
            onChange={e => setNewAccount({ ...newAccount, initial_currency: e.target.value })}
          >
            {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            type="number"
            placeholder="Начальный баланс"
            value={newAccount.initial_balance}
            step="0.01"
            onChange={e => setNewAccount({ ...newAccount, initial_balance: e.target.value })}
            style={{ width: 140 }}
          />
          <input
            placeholder="Иконка"
            value={newAccount.icon}
            onChange={e => setNewAccount({ ...newAccount, icon: e.target.value })}
            style={{ width: 70 }}
          />
          <label style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, color: "#515c68", cursor: "pointer",
            whiteSpace: "nowrap",
          }}>
            <input
              type="checkbox"
              checked={newAccount.include_in_balance}
              onChange={e => setNewAccount({
                ...newAccount,
                include_in_balance: e.target.checked,
                show_for_entries: newAccount.show_for_entries === newAccount.include_in_balance
                  ? e.target.checked
                  : newAccount.show_for_entries,
              })}
            />
            Учитывать в общем балансе
          </label>
          <label style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, color: "#515c68", cursor: "pointer",
            whiteSpace: "nowrap",
          }}>
            <input
              type="checkbox"
              checked={newAccount.show_for_entries}
              onChange={e => setNewAccount({ ...newAccount, show_for_entries: e.target.checked })}
            />
            Показывать для записей
          </label>
          <button type="submit">Создать</button>
        </form>
      )}

      {/* Группы */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {groups.length === 0 ? (
          <p style={{ color: "#a6afb8" }}>Нет счетов. Создайте первый!</p>
        ) : (
          groups.map(bucket => (
            <GroupBucket
              key={bucket.group.id ?? UNGROUPED_KEY}
              bucket={bucket}
              mainCurrency={mainCurrency}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              collapsedGroups={collapsedGroups}
              onToggleGroup={toggleGroup}
              onDeleteGroup={handleDeleteGroup}
              onDeleteAccount={handleDeleteAccount}
              onToggleInclude={handleToggleInclude}
              onToggleShowForEntries={handleToggleShowForEntries}
              addingCurrencyTo={addingCurrencyTo}
              setAddingCurrencyTo={setAddingCurrencyTo}
              currencyForm={currencyForm}
              setCurrencyForm={setCurrencyForm}
              onAddCurrency={handleAddCurrency}
              onAdjustBalance={(account, balance) => setAdjustingBalance({ account, balance })}
              onDeleteCurrency={handleDeleteCurrency}
              onCurrencyClick={goToAccountCurrency}
              activeDrag={activeDrag}
            />
          ))
        )}

        <DragOverlay>
          {activeDrag ? (
            <div style={{
              background: "#fffdf7",
              border: "2px solid #173a54",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 14,
              fontWeight: 500,
              boxShadow: "0 8px 16px rgba(0,0,0,0.15)",
            }}>
              {activeDrag.icon ? `${activeDrag.icon} ` : ""}{activeDrag.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {adjustingBalance && (
        <BalanceAdjustmentModal
          account={adjustingBalance.account}
          balance={adjustingBalance.balance}
          onClose={() => setAdjustingBalance(null)}
          onSaved={() => {
            setAdjustingBalance(null);
            fetchGroups();
            window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
          }}
        />
      )}
    </div>
  );
}

// --- subcomponents ---

function GroupBucket({
  bucket, mainCurrency, expanded, onToggleExpand,
  collapsedGroups, onToggleGroup,
  onDeleteGroup, onDeleteAccount, onToggleInclude, onToggleShowForEntries,
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
          {formatMoney(bucket.total_in_main)} {currencySymbol(mainCurrency)}
        </span>
        {groupId !== null && (
          <button className="account-group-delete"
            type="button"
            onClick={() => onDeleteGroup(bucket.group)}
            className="btn-ghost"
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

function AccountRow({
  acc, groupKey, mainCurrency,
  isExpanded, onToggleExpand,
  onDelete, onToggleInclude, onToggleShowForEntries,
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
          {formatMoney(acc.total_in_main)} {currencySymbol(mainCurrency)}
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

function BalanceAdjustmentModal({ account, balance, onClose, onSaved }) {
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
