
import { formatMoney, currencySymbol, COMMON_CURRENCIES } from "../utils/money";

import { DndContext, closestCenter, DragOverlay } from "@dnd-kit/core";

import { GroupBucket, BalanceAdjustmentModal } from "../components/accounts/AccountRows";

import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { useAccountsController } from "../hooks/useAccountsController";
import { ACCOUNT_TYPES, UNGROUPED_KEY } from "../utils/accountsView";

export default function Accounts() {
  const { navigate, mainCurrency, user, groups, loading, error, setError, collapsedGroups, newGroupName, setNewGroupName, showNewAccount, setShowNewAccount, newAccount, setNewAccount, expanded, addingCurrencyTo, setAddingCurrencyTo, currencyForm, setCurrencyForm, activeDrag, adjustingBalance, setAdjustingBalance, sensors, fetchGroups, toggleExpand, toggleGroup, goToAccountCurrency, handleCreateGroup, handleDeleteGroup, handleCreateAccount, handleDeleteAccount, handleToggleInclude, handleToggleShowForEntries, handleEditNote, handleAddCurrency, handleDeleteCurrency, handleDragStart, handleDragEnd, conversionUnavailable, grandTotal } = useAccountsController();
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
            {conversionUnavailable ? "Недоступен курс валюты" : `${formatMoney(grandTotal)} ${currencySymbol(mainCurrency)}`}
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

        {user?.family_access && (
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
          <input
            placeholder="Комментарий к счёту"
            value={newAccount.note}
            onChange={e => setNewAccount({ ...newAccount, note: e.target.value })}
            maxLength={500}
            title="Не указывайте пароль, PIN, CVV или реквизиты карты"
            style={{ minWidth: 220 }}
          />
          <small style={{ flexBasis: "100%", color: "#7a8590", fontSize: 12 }}>
            Комментарий виден только вам. Не храните здесь пароль, PIN, CVV и полные реквизиты карты.
          </small>
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
              onEditNote={handleEditNote}
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
