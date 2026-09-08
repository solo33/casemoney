import TransactionCreateForm from "../components/transactions/TransactionCreateForm";
import TransactionTable from "../components/transactions/TransactionTable";

import { Link } from "react-router-dom";

import CategoryOptions from "../components/CategoryOptions";
import { Pagination, EditRow, MobileTransactionCard } from "../components/transactions/TransactionRows";
import { formatMoney, currencySymbol } from "../utils/money";

import { useTransactionsController } from "../hooks/useTransactionsController";

export default function Transactions() {
  const { user, data, accounts, accountGroups, categories, setCategories, tags, setTags, tagReport, frequentCategories, categorySuggestion, transferSuggestions, transferFees, setTransferFees, matchingTransferId, loading, error, setError, notice, setNotice, editing, setEditing, filtersOpen, setFiltersOpen, selectedIds, setSelectedIds, bulkCategoryId, setBulkCategoryId, bulkSaving, filters, page, setPage, newTx, setNewTx, applyCategorySuggestion, saveSuggestedCategoryRule, loadAccounts, loadTransactions, showTransferSuggestions, confirmTransferSuggestion, newTxCurrencies, newTxTargetCurrencies, sameNewTransferCurrency, newQuoteLoading, newDisplayedRate, swapNewTransferAccounts, handleCreate, handleDelete, canBulkCategorize, bulkCategories, toggleSelection, toggleAllPage, applyBulkCategory, accountName, categoryNameFor, formatDate, formatDateTime, filteredCategoriesForCreate, totalPages, showingFrom, showingTo, setFilter, applyDatePreset, resetFilters, hasFilters } = useTransactionsController();
  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div className="transactions-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Записи</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Link to="/import" className="btn-ghost" style={{ textDecoration: "none", padding: "7px 12px" }}>Импорт</Link>
          <Link to="/history" className="btn-ghost" style={{ textDecoration: "none", padding: "7px 12px" }}>История</Link>
          <button className="transactions-desktop-add"
            type="button"
            onClick={() => setEditing(editing === "new" ? null : "new")}
          >
            {editing === "new" ? "Отмена" : "+ Добавить"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          color: "#c0432b", padding: "8px 12px",
          background: "#fef2f0", border: "1px solid #fecdd3",
          borderRadius: 8, marginBottom: 12,
        }}>
          {error}{" "}
          <button onClick={() => setError(null)} className="btn-ghost" style={{ padding: "2px 8px", marginLeft: "auto" }}>×</button>
        </div>
      )}
      {notice && (
        <div role="status" style={{
          color: "#167a4a", padding: "8px 12px", display: "flex", alignItems: "center",
          background: "#edf8f0", border: "1px solid #bde5c8", borderRadius: 8, marginBottom: 12,
        }}>
          {notice}<button onClick={() => setNotice(null)} className="btn-ghost" style={{ padding: "2px 8px", marginLeft: "auto" }}>×</button>
        </div>
      )}

      {/* Форма создания */}
      {editing === "new" && (
        <TransactionCreateForm handleCreate={handleCreate} newTx={newTx} setNewTx={setNewTx} newTxCurrencies={newTxCurrencies} accountGroups={accountGroups} swapNewTransferAccounts={swapNewTransferAccounts} sameNewTransferCurrency={sameNewTransferCurrency} newQuoteLoading={newQuoteLoading} newTxTargetCurrencies={newTxTargetCurrencies} newDisplayedRate={newDisplayedRate} categories={categories} filteredCategoriesForCreate={filteredCategoriesForCreate} setCategories={setCategories} frequentCategories={frequentCategories} categorySuggestion={categorySuggestion} applyCategorySuggestion={applyCategorySuggestion} saveSuggestedCategoryRule={saveSuggestedCategoryRule} user={user} tags={tags} setTags={setTags} />
      )}

      {/* Фильтры */}
      <button type="button" className="transactions-filter-trigger btn-ghost" onClick={() => setFiltersOpen(true)}>
        Фильтры{hasFilters ? ` · ${Object.values(filters).filter(Boolean).length}` : ""}
      </button>
      {filtersOpen && <button type="button" className="mobile-sheet-backdrop" aria-label="Закрыть фильтры" onClick={() => setFiltersOpen(false)} />}
      <div className={`transactions-filters${filtersOpen ? " is-open" : ""}`} style={{
        background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
        padding: 12, marginBottom: 12,
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
      }}>
        <input
          placeholder="Поиск в описании..."
          value={filters.q}
          onChange={e => setFilter("q", e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <select value={filters.type} onChange={e => setFilter("type", e.target.value)}>
          <option value="">Все типы</option>
          <option value="expense">Расход</option>
          <option value="income">Доход</option>
          <option value="transfer">Перевод</option>
        </select>
        <select value={filters.account_id} onChange={e => setFilter("account_id", e.target.value)}>
          <option value="">Все счета</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={filters.category_id} onChange={e => setFilter("category_id", e.target.value)}>
          <option value="">Все категории</option>
          <CategoryOptions categories={categories} />
        </select>
        <select value={filters.tag_id} onChange={e => setFilter("tag_id", e.target.value)}>
          <option value="">Все метки и проекты</option>
          {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select>
        <input
          type="date"
          value={filters.date_from}
          onChange={e => setFilter("date_from", e.target.value)}
          title="С"
        />
        <input
          type="date"
          value={filters.date_to}
          onChange={e => setFilter("date_to", e.target.value)}
          title="по"
        />
        <div className="transactions-date-presets" aria-label="Быстрый выбор периода">
          <button type="button" onClick={() => applyDatePreset("today")}>Сегодня</button>
          <button type="button" onClick={() => applyDatePreset("this_week")}>Эта неделя</button>
          <button type="button" onClick={() => applyDatePreset("last_week")}>Прошлая неделя</button>
          <button type="button" onClick={() => applyDatePreset("this_month")}>Этот месяц</button>
          <button type="button" onClick={() => applyDatePreset("last_month")}>Прошлый месяц</button>
        </div>
        {filters.currency && (
          <span style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, padding: "6px 10px", borderRadius: 999,
            background: "#f6f2e9", border: "1px solid #e4ddcd", color: "#515c68",
          }}>
            Валюта: {filters.currency}
            <button
              type="button"
              onClick={() => setFilter("currency", "")}
              className="btn-ghost"
              style={{ padding: "0 4px", fontSize: 13, border: "none" }}
            >×</button>
          </span>
        )}
        {hasFilters && (
          <button className="btn-ghost" onClick={resetFilters}>Сбросить</button>
        )}
        <button type="button" className="transactions-filter-done" onClick={() => setFiltersOpen(false)}>Показать записи</button>
      </div>

      {/* Pagination header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 8, fontSize: 13, color: "#7a8590",
      }}>
        <div>
          {loading ? "Загрузка..." : (
            data.total === 0 ? "Нет транзакций" :
            `${showingFrom}–${showingTo} из ${data.total.toLocaleString("ru-RU")}`
          )}
        </div>
        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="transactions-bulk-bar">
          <span>Выбрано: <b>{selectedIds.length}</b></span>
          {canBulkCategorize ? <>
            <select value={bulkCategoryId} onChange={event => setBulkCategoryId(event.target.value)} aria-label="Новая категория для выбранных записей">
              <option value="">Выберите категорию</option>
              {bulkCategories.map(category => <option key={category.id} value={category.id}>{category.parent_id ? "↳ " : ""}{category.name}</option>)}
            </select>
            <button type="button" disabled={!bulkCategoryId || bulkSaving} onClick={applyBulkCategory}>{bulkSaving ? "Меняем…" : "Изменить категорию"}</button>
          </> : <small>Выберите только доходы или только расходы — переводы не категоризируются.</small>}
          <button type="button" className="btn-ghost" onClick={() => setSelectedIds([])}>Снять выбор</button>
        </div>
      )}

      {showTransferSuggestions && transferSuggestions.length > 0 && (
        <section className="transfer-suggestions" aria-label="Возможные переводы между своими счетами">
          <div className="transfer-suggestions-title">
            <strong>Возможные переводы между своими счетами</strong>
            <small>Ничего не меняется без подтверждения.</small>
          </div>
          {transferSuggestions.map(suggestion => {
            const feeCategories = categories.filter(category => category.type === "expense");
            return <div className="transfer-suggestion" key={`${suggestion.expense_id}-${suggestion.income_id}`}>
              <span>
                {suggestion.account_name} → {suggestion.to_account_name}: <b>{formatMoney(suggestion.amount)} {currencySymbol(suggestion.currency)}</b>
                {suggestion.currency !== suggestion.to_currency && <> → <b>{formatMoney(suggestion.to_amount)} {currencySymbol(suggestion.to_currency)}</b></>}
              </span>
              {suggestion.fee_amount > 0 && <label className="transfer-fee-select">
                Комиссия {formatMoney(suggestion.fee_amount)} {currencySymbol(suggestion.currency)}
                <select value={transferFees[suggestion.expense_id] || ""} onChange={event => setTransferFees(current => ({ ...current, [suggestion.expense_id]: event.target.value }))}>
                  <option value="">не учитывать отдельно</option>
                  {feeCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>}
              <button type="button" className="btn-ghost" disabled={matchingTransferId === suggestion.expense_id} onClick={() => confirmTransferSuggestion(suggestion)}>
                {matchingTransferId === suggestion.expense_id ? "Связываем…" : "Связать"}
              </button>
            </div>;
          })}
        </section>
      )}

      {tagReport && (
        <section className="tag-project-report" aria-label={`Сводка по проекту ${tagReport.tag.name}`}>
          <div><span className="tag-project-dot" style={{ background: tagReport.tag.color }} />Проект: <strong>{tagReport.tag.name}</strong></div>
          {tagReport.totals.length === 0
            ? <small>Пока нет выполненных доходов или расходов.</small>
            : <div className="tag-project-totals">{tagReport.totals.map(total => (
              <span key={`${total.type}-${total.currency}`} className={`is-${total.type}`}>
                {total.type === "income" ? "Доходы" : "Расходы"}: {formatMoney(total.amount)} {currencySymbol(total.currency)}
              </span>
            ))}</div>}
        </section>
      )}

      {/* Таблица */}
      {data.items.length > 0 && (
        <div className="table-wrap transactions-desktop-table" style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 8,
        }}>
          <TransactionTable data={data} selectedIds={selectedIds} toggleAllPage={toggleAllPage} editing={editing} accounts={accounts} accountGroups={accountGroups} categories={categories} tags={tags} user={user} setCategories={setCategories} setTags={setTags} setEditing={setEditing} loadTransactions={loadTransactions} loadAccounts={loadAccounts} accountName={accountName} categoryNameFor={categoryNameFor} formatDate={formatDate} formatDateTime={formatDateTime} handleDelete={handleDelete} toggleSelection={toggleSelection} />
        </div>
      )}

      {data.items.length > 0 && (
        <div className="transactions-mobile-list">
          {data.items.map(tx => (
            <div key={tx.id}>
              <MobileTransactionCard
              tx={tx}
              accountName={accountName}
              categoryName={categoryNameFor}
              formatDate={formatDate} formatDateTime={formatDateTime}
                onEdit={() => setEditing(editing === tx.id ? null : tx.id)}
                onDelete={() => handleDelete(tx.id)}
                checked={selectedIds.includes(tx.id)}
                onToggle={() => toggleSelection(tx.id)}
              />
              {editing === tx.id && (
                <table className="transactions-mobile-edit"><tbody><EditRow
                  tx={tx} accounts={accounts} accountGroups={accountGroups} categories={categories} tags={tags}
                  canUseFamily={Boolean(user?.family_access)}
                  onCategoryCreated={category => setCategories(current => [...current, category])}
                  onTagCreated={tag => setTags(current => [...current, tag].sort((a, b) => a.name.localeCompare(b.name, "ru")))}
                  onCancel={() => setEditing(null)}
                  onSaved={() => { setEditing(null); loadTransactions(); loadAccounts(); }}
                /></tbody></table>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
