import AmountInput from "../AmountInput";
import CurrencyField from "../CurrencyField";
import { COMMON_CURRENCIES } from "../../utils/money";
import AccountOptions from "../AccountOptions";
import CategoryPicker from "../CategoryPicker";
import { Link } from "react-router-dom";
import TagPicker from "../TagPicker";

export default function TransactionCreateForm({ handleCreate, newTx, setNewTx, newTxCurrencies, accountGroups, swapNewTransferAccounts, sameNewTransferCurrency, newQuoteLoading, newTxTargetCurrencies, newDisplayedRate, categories, filteredCategoriesForCreate, setCategories, frequentCategories, categorySuggestion, applyCategorySuggestion, saveSuggestedCategoryRule, user, tags, setTags }) {
  return (
    <form onSubmit={handleCreate} style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
          padding: 14, marginBottom: 16,
          display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        }}>
          <select value={newTx.type} onChange={e => setNewTx({ ...newTx, type: e.target.value, category_id: "" })}>
            <option value="expense">Расход</option>
            <option value="income">Доход</option>
            <option value="transfer">Перевод</option>
          </select>
          <AmountInput
            type="number" placeholder="Сумма" min="0.01" step="0.01"
            value={newTx.amount}
            onChange={e => setNewTx({ ...newTx, amount: e.target.value })}
            required inputStyle={{ width: 110 }}
          />
          <CurrencyField currencies={newTxCurrencies} fallback={COMMON_CURRENCIES} value={newTx.currency} onChange={e => setNewTx({ ...newTx, currency: e.target.value })} />
          <select value={newTx.account_id} onChange={e => setNewTx({ ...newTx, account_id: e.target.value })} required>
            <option value="">— Счёт —</option>
            <AccountOptions groups={accountGroups} />
          </select>
          {newTx.type === "transfer" ? (
            <>
              <button type="button" className="transfer-swap-button" onClick={swapNewTransferAccounts} disabled={!newTx.to_account_id} aria-label="Поменять счета отправки и получения местами" title="Поменять счета местами">⇄</button>
              <select value={newTx.to_account_id} onChange={e => setNewTx({ ...newTx, to_account_id: e.target.value, to_currency: "", to_amount: "" })} required>
                <option value="">— На счёт —</option>
                <AccountOptions groups={accountGroups} excludeId={newTx.account_id} />
              </select>
              {!sameNewTransferCurrency && (
                <AmountInput type="number" inputMode="decimal" min="0.01" step="0.01" value={newTx.to_amount} onChange={e => setNewTx({ ...newTx, to_amount: e.target.value })} placeholder={newQuoteLoading ? "Считаем…" : "Зачислить"} required inputStyle={{ width: 110 }} />
              )}
              <CurrencyField currencies={newTxTargetCurrencies} value={newTx.to_currency} onChange={e => setNewTx({ ...newTx, to_currency: e.target.value, to_amount: "" })} />
              {newTx.currency && newTx.to_currency && newTx.currency !== newTx.to_currency && newDisplayedRate && <small>1 {newTx.currency} = {newDisplayedRate.toLocaleString("ru-RU", { maximumFractionDigits: 8 })} {newTx.to_currency}</small>}
              <AmountInput type="number" inputMode="decimal" min="0" step="0.01" value={newTx.fee_amount} onChange={e => setNewTx({ ...newTx, fee_amount: e.target.value })} placeholder="Комиссия" inputStyle={{ width: 110 }} />
              <CategoryPicker categories={categories.filter(c => c.type === "expense")} value={newTx.fee_category_id} onChange={fee_category_id => setNewTx({ ...newTx, fee_category_id })} placeholder="Категория комиссии" style={{ minWidth: 180 }} />
            </>
          ) : (
            <>
              <CategoryPicker
                categories={filteredCategoriesForCreate}
                value={newTx.category_id}
                onChange={category_id => setNewTx({ ...newTx, category_id })}
                onCategoryCreated={category => setCategories(current => [...current, category])}
                placeholder="— Категория —"
                style={{ minWidth: 180 }}
              />
              {frequentCategories.length > 0 && (
                <div className="quick-category-pills" aria-label="Частые категории">
                  {frequentCategories.map(category => (
                    <button type="button" key={category.id}
                      className={String(newTx.category_id) === String(category.id) ? "is-active" : ""}
                      onClick={() => setNewTx({ ...newTx, category_id: String(category.id) })}
                    >{category.icon ? `${category.icon} ` : ""}{category.name}</button>
                  ))}
                </div>
              )}
              {categorySuggestion && (
                <div className="category-suggestion" role="status">
                  <span>Подсказка: <strong>{categorySuggestion.category_name}</strong>{categorySuggestion.source === "history" ? ` — ${categorySuggestion.matching_operations} похожих операций` : " — ваше правило"}</span>
                  <button type="button" onClick={applyCategorySuggestion}>Выбрать</button>
                  {categorySuggestion.source === "history" && <button type="button" className="btn-ghost" onClick={saveSuggestedCategoryRule}>Запомнить</button>}
                </div>
              )}
              {user?.family_access && <Link className="quick-template-link" to="/settings/templates">Шаблоны</Link>}
              <TagPicker
                tags={tags}
                value={newTx.tag_ids}
                onChange={tag_ids => setNewTx({ ...newTx, tag_ids })}
                onTagCreated={tag => setTags(current => [...current, tag].sort((a, b) => a.name.localeCompare(b.name, "ru")))}
              />
            </>
          )}
          <input type="date" value={newTx.date} onChange={e => setNewTx({ ...newTx, date: e.target.value })} />
          <input
            placeholder="Описание"
            value={newTx.description}
            onChange={e => setNewTx({ ...newTx, description: e.target.value })}
            style={{ flex: 1, minWidth: 160 }}
          />
          <button type="submit">Сохранить</button>
        </form>
  );
}
