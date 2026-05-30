import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
} from "@dnd-kit/core";
import api from "../api/client";
import { useUser } from "../contexts/UserContext";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { COMMON_CURRENCIES, currencySymbol, formatMoney, formatMoneyWithCurrency } from "../utils/money";

const ACCOUNT_TYPES = [
  { value: "cash",   label: "Наличные" },
  { value: "card",   label: "Карта" },
  { value: "bank",   label: "Банк" },
  { value: "crypto", label: "Крипто" },
];

const UNGROUPED_KEY = "__ungrouped__";

export default function Accounts() {
  const { mainCurrency } = useUser();
  const [groups, setGroups] = useState([]);  // grouped response
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Forms / state
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: "", type: "cash", color: "", icon: "",
    initial_currency: "RUB", initial_balance: 0,
    group_id: "",
    include_in_balance: true,
  });
  const [expanded, setExpanded] = useState(new Set());        // account ids with expanded balances
  const [addingCurrencyTo, setAddingCurrencyTo] = useState(null);  // account.id
  const [currencyForm, setCurrencyForm] = useState({ currency: "USD", balance: 0 });
  const [activeDrag, setActiveDrag] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const fetchGroups = useCallback(async () => {
    try {
      const res = await api.get("/api/accounts/grouped");
      setGroups(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка загрузки счетов");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
    window.addEventListener(TX_ADDED_EVENT, fetchGroups);
    return () => window.removeEventListener(TX_ADDED_EVENT, fetchGroups);
  }, [fetchGroups]);

  // Refetch when main currency changes (нужны новые total_in_main)
  useEffect(() => { fetchGroups(); }, [mainCurrency, fetchGroups]);

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
    try {
      await api.put(`/api/accounts/${acc.id}`, { include_in_balance: !acc.include_in_balance });
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось обновить");
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

  const handleEditBalance = async (acc, bal) => {
    const newValue = prompt(`Изменить баланс ${bal.currency}:`, bal.balance);
    if (newValue === null) return;
    const num = parseFloat(newValue);
    if (Number.isNaN(num)) { setError("Некорректное число"); return; }
    try {
      await api.put(`/api/accounts/${acc.id}/balances/${bal.currency}`, { balance: num });
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось обновить баланс");
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

  const handleDragEnd = async (event) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const dragged = active.data.current;
    const target = over.data.current;
    if (!dragged || !target) return;
    const targetGroupId = target.groupId === UNGROUPED_KEY ? null : target.groupId;
    if (dragged.groupId === targetGroupId) return;
    try {
      await api.put(`/api/accounts/${dragged.accountId}`, { group_id: targetGroupId });
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось переместить счёт");
    }
  };

  const grandTotal = groups.reduce((s, g) => s + (g.total_in_main || 0), 0);

  if (loading) return <div className="page">Загрузка...</div>;

  return (
    <div className="page">
      {/* Header: общий баланс + действия */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
        marginBottom: 20,
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13, color: "#78716c" }}>Общий баланс</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#9f1239" }}>
            {formatMoney(grandTotal)} {currencySymbol(mainCurrency)}
          </div>
        </div>

        <form onSubmit={handleCreateGroup} style={{ display: "flex", gap: 6 }}>
          <input
            placeholder="Новая группа"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            style={{ width: 180 }}
          />
          <button type="submit">+ Группа</button>
        </form>

        <button onClick={() => setShowNewAccount(s => !s)} type="button">
          {showNewAccount ? "Отмена" : "+ Счёт"}
        </button>
      </div>

      {error && (
        <div style={{
          color: "#b91c1c", marginBottom: 12, padding: "8px 12px",
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
          background: "#fff", border: "1px solid #e7e5e0", borderRadius: 10,
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
            fontSize: 13, color: "#57534e", cursor: "pointer",
            whiteSpace: "nowrap",
          }}>
            <input
              type="checkbox"
              checked={newAccount.include_in_balance}
              onChange={e => setNewAccount({ ...newAccount, include_in_balance: e.target.checked })}
            />
            Учитывать в общем балансе
          </label>
          <button type="submit">Создать</button>
        </form>
      )}

      {/* Группы */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {groups.length === 0 ? (
          <p style={{ color: "#a8a29e" }}>Нет счетов. Создайте первый!</p>
        ) : (
          groups.map(bucket => (
            <GroupBucket
              key={bucket.group.id ?? UNGROUPED_KEY}
              bucket={bucket}
              mainCurrency={mainCurrency}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onDeleteGroup={handleDeleteGroup}
              onDeleteAccount={handleDeleteAccount}
              onToggleInclude={handleToggleInclude}
              addingCurrencyTo={addingCurrencyTo}
              setAddingCurrencyTo={setAddingCurrencyTo}
              currencyForm={currencyForm}
              setCurrencyForm={setCurrencyForm}
              onAddCurrency={handleAddCurrency}
              onEditBalance={handleEditBalance}
              onDeleteCurrency={handleDeleteCurrency}
              activeDrag={activeDrag}
            />
          ))
        )}

        <DragOverlay>
          {activeDrag ? (
            <div style={{
              background: "#fff",
              border: "2px solid #9f1239",
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
    </div>
  );
}

// --- subcomponents ---

function GroupBucket({
  bucket, mainCurrency, expanded, onToggleExpand,
  onDeleteGroup, onDeleteAccount, onToggleInclude,
  addingCurrencyTo, setAddingCurrencyTo, currencyForm, setCurrencyForm,
  onAddCurrency, onEditBalance, onDeleteCurrency,
  activeDrag,
}) {
  const groupId = bucket.group.id;
  const groupKey = groupId === null ? UNGROUPED_KEY : groupId;
  const { setNodeRef, isOver } = useDroppable({
    id: `group-${groupKey}`,
    data: { groupId: groupKey },
  });

  const canAccept = activeDrag && activeDrag.groupId !== groupId;
  const dropHighlight = isOver && canAccept;

  return (
    <div ref={setNodeRef} style={{
      marginBottom: 16,
      border: `1px solid ${dropHighlight ? "#9f1239" : "#e7e5e0"}`,
      background: "#fff",
      borderRadius: 10,
      outline: dropHighlight ? "2px solid rgba(159, 18, 57, 0.25)" : "none",
    }}>
      {/* Group header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        background: "#faf8f3",
        borderRadius: "10px 10px 0 0",
        borderBottom: bucket.accounts.length ? "1px solid #e7e5e0" : "none",
      }}>
        <span style={{ fontWeight: 600, color: "#44403c", flex: 1 }}>
          {bucket.group.name}
          <span style={{ color: "#a8a29e", fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
            ({bucket.accounts.length})
          </span>
        </span>
        <span style={{ fontWeight: 700 }}>
          {formatMoney(bucket.total_in_main)} {currencySymbol(mainCurrency)}
        </span>
        {groupId !== null && (
          <button
            type="button"
            onClick={() => onDeleteGroup(bucket.group)}
            className="btn-ghost"
            style={{ padding: "2px 8px", fontSize: 12, color: "#b91c1c" }}
            title="Удалить группу"
          >
            ×
          </button>
        )}
      </div>

      {/* Accounts list */}
      {bucket.accounts.length === 0 ? (
        <div style={{ padding: 16, color: "#a8a29e", fontSize: 13 }}>
          Перетащите счёт сюда
        </div>
      ) : (
        bucket.accounts.map(acc => (
          <AccountRow
            key={acc.id}
            acc={acc}
            groupId={groupId}
            mainCurrency={mainCurrency}
            isExpanded={expanded.has(acc.id)}
            onToggleExpand={() => onToggleExpand(acc.id)}
            onDelete={onDeleteAccount}
            onToggleInclude={onToggleInclude}
            isAddingCurrency={addingCurrencyTo === acc.id}
            setAddingCurrency={(v) => setAddingCurrencyTo(v ? acc.id : null)}
            currencyForm={currencyForm}
            setCurrencyForm={setCurrencyForm}
            onAddCurrency={onAddCurrency}
            onEditBalance={onEditBalance}
            onDeleteCurrency={onDeleteCurrency}
          />
        ))
      )}
    </div>
  );
}

function AccountRow({
  acc, groupId, mainCurrency,
  isExpanded, onToggleExpand,
  onDelete, onToggleInclude,
  isAddingCurrency, setAddingCurrency,
  currencyForm, setCurrencyForm,
  onAddCurrency, onEditBalance, onDeleteCurrency,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `acc-${acc.id}`,
    data: { accountId: acc.id, groupId, name: acc.name, icon: acc.icon },
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.3 : 1,
  };

  const multiCurrency = (acc.balances || []).length > 1;
  const presentCurrencies = (acc.balances || []).map(b => b.currency);
  const availableCurrencies = COMMON_CURRENCIES.filter(c => !presentCurrencies.includes(c));

  const excluded = !acc.include_in_balance;

  return (
    <div ref={setNodeRef} style={{ ...style }}>
      {/* Main row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        borderTop: "1px solid #ede9df",
        background: excluded ? "#faf8f3" : "#fff",
        opacity: excluded ? 0.75 : 1,
      }}>
        <span
          style={{ cursor: "grab", color: "#d6d3d1", fontSize: 16, userSelect: "none" }}
          {...listeners}
          {...attributes}
          title="Перетащите в другую группу"
        >
          ⋮⋮
        </span>
        {acc.icon && <span style={{ fontSize: 18 }}>{acc.icon}</span>}
        <span style={{ fontWeight: 500, flex: 1, cursor: multiCurrency ? "pointer" : "default" }}
              onClick={() => multiCurrency && onToggleExpand()}>
          {acc.name}
          {excluded && (
            <span style={{
              marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 4,
              background: "#fef3c7", color: "#854d0e",
              textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600,
              verticalAlign: "middle",
            }}>
              не в балансе
            </span>
          )}
          {multiCurrency && (
            <span style={{ marginLeft: 6, color: "#a8a29e", fontSize: 12 }}>
              {isExpanded ? "▾" : "▸"} {acc.balances.length} валют
            </span>
          )}
        </span>
        <span style={{
          fontWeight: 700, fontSize: 15,
          color: excluded ? "#a8a29e" : (acc.color || "#1c1917"),
          textDecoration: excluded ? "line-through" : "none",
        }}>
          {formatMoney(acc.total_in_main)} {currencySymbol(mainCurrency)}
        </span>
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
          style={{ padding: "2px 8px", fontSize: 14, color: "#b91c1c" }}
          title="Удалить счёт"
        >
          ×
        </button>
      </div>

      {/* Balances detail */}
      {(isExpanded || !multiCurrency) && (acc.balances || []).length > 0 && (
        <div style={{ padding: "0 14px 8px 44px" }}>
          {acc.balances.map(b => (
            <div key={b.currency} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
              fontSize: 13, color: "#57534e",
            }}>
              <span style={{ minWidth: 50, fontWeight: 600 }}>{b.currency}</span>
              <span style={{ flex: 1 }}>
                {formatMoneyWithCurrency(b.balance, b.currency)}
              </span>
              {b.currency !== mainCurrency && (
                <span style={{ color: "#a8a29e", fontSize: 12 }}>
                  ≈ {formatMoney(b.balance_in_main)} {currencySymbol(mainCurrency)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onEditBalance(acc, b)}
                className="btn-ghost"
                style={{ padding: "1px 6px", fontSize: 11 }}
              >
                ✎
              </button>
              {acc.balances.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteCurrency(acc, b)}
                  className="btn-ghost"
                  style={{ padding: "1px 6px", fontSize: 11, color: "#b91c1c" }}
                >
                  ×
                </button>
              )}
            </div>
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
