import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import AccountOptions, { entryAccountGroups } from "../components/AccountOptions";
import CategoryOptions from "../components/CategoryOptions";
import CategoryPicker from "../components/CategoryPicker";
import {
  COMMON_CURRENCIES,
  currencySymbol,
  formatMoney,
  sortCurrenciesRubFirst,
} from "../utils/money";
import { clearIdempotencyKey, idempotencyKeyFor } from "../utils/idempotency";
import { submitOrQueueTransaction } from "../services/offlineMutations";
import { cachedAccountsAndCategories, saveReferenceData } from "../services/offlineReferenceData";
import AmountInput from "../components/AmountInput";
import CurrencyField from "../components/CurrencyField";
import useTransferQuote from "../hooks/useTransferQuote";
import { useUser } from "../contexts/UserContext";

const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" };
const TYPE_COLOR = { income: "#167a4a", expense: "#c0432b", transfer: "#2f6296" };
const TYPE_ICON = { income: "↗", expense: "↘", transfer: "⇄" };
const PAGE_SIZE = 50;

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function Transactions() {
  const { user } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ items: [], total: 0 });
  const [accounts, setAccounts] = useState([]);
  const [accountGroups, setAccountGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [frequentCategories, setFrequentCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);    // tx id или 'new'
  const [filtersOpen, setFiltersOpen] = useState(false);
  const createRequestRef = useRef(null);

  // Фильтры — инициализируются из URL (для глубоких ссылок из Annual)
  const [filters, setFilters] = useState(() => ({
    account_id: searchParams.get("account_id") || "",
    currency: searchParams.get("currency") || "",
    category_id: searchParams.get("category_id") || "",
    type: searchParams.get("type") || "",
    date_from: searchParams.get("date_from") || "",
    date_to: searchParams.get("date_to") || "",
    q: searchParams.get("q") || "",
  }));
  const [page, setPage] = useState(0);

  // При смене URL — обновим фильтры (например, переход с Annual)
  useEffect(() => {
    setFilters({
      account_id: searchParams.get("account_id") || "",
      currency: searchParams.get("currency") || "",
      category_id: searchParams.get("category_id") || "",
      type: searchParams.get("type") || "",
      date_from: searchParams.get("date_from") || "",
      date_to: searchParams.get("date_to") || "",
      q: searchParams.get("q") || "",
    });
    setPage(0);
  }, [searchParams]);

  // Форма создания
  const [newTx, setNewTx] = useState({
    amount: "", type: "expense", currency: "",
    description: "", account_id: "", category_id: "", to_account_id: "",
    to_amount: "", to_currency: "", fee_amount: "", fee_category_id: "",
    date: isoToday(),
  });

  const loadAccounts = useCallback(async () => {
    const applyOptions = (groups, nextCategories) => {
      const flatAccounts = groups.flatMap(bucket => bucket.accounts || []);
      const visibleGroups = entryAccountGroups(groups);
      const visibleAccounts = visibleGroups.flatMap(bucket => bucket.accounts || []);
      setAccountGroups(groups);
      setAccounts(flatAccounts);
      setCategories(nextCategories);
      if (visibleAccounts.length > 0 && !newTx.account_id) {
        const first = visibleAccounts[0];
        setNewTx(t => ({
          ...t,
          account_id: String(first.id),
          currency: sortCurrenciesRubFirst(
            (first.balances || []).map(balance => balance.currency)
          )[0] || "RUB",
        }));
      }
    };

    const cached = cachedAccountsAndCategories();
    if (cached) applyOptions(cached.accountGroups, cached.categories);
    if (navigator.onLine === false) return;

    try {
      const [acc, cat] = await Promise.all([
        api.get("/api/accounts/grouped", { params: { convert_balances: false } }),
        api.get("/api/categories/"),
      ]);
      const groups = acc.data || [];
      const nextCategories = cat.data || [];
      applyOptions(groups, nextCategories);
      saveReferenceData({ accountGroups: groups, categories: nextCategories });
    } catch (error) {
      if (!cached) throw error;
    }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await api.get("/api/transactions/", { params });
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadTransactions(); }, [loadTransactions]);
  useEffect(() => {
    if (newTx.type === "transfer") { setFrequentCategories([]); return; }
    api.get("/api/transactions/frequent-categories", { params: { tx_type: newTx.type } })
      .then(response => setFrequentCategories(response.data || []))
      .catch(() => setFrequentCategories([]));
  }, [newTx.type]);

  // Reload on FAB add
  useEffect(() => {
    const onAdded = () => { setPage(0); loadTransactions(); };
    window.addEventListener(TX_ADDED_EVENT, onAdded);
    return () => window.removeEventListener(TX_ADDED_EVENT, onAdded);
  }, [loadTransactions]);

  // Когда меняется выбранный счёт в форме создания — подкорректировать валюту
  useEffect(() => {
    if (!newTx.account_id || !accounts.length) return;
    const acc = accounts.find(a => String(a.id) === String(newTx.account_id));
    if (!acc?.balances?.length) return;
    const codes = sortCurrenciesRubFirst(acc.balances.map(b => b.currency));
    if (!codes.includes(newTx.currency)) {
      setNewTx(t => ({ ...t, currency: codes[0] }));
    }
  }, [newTx.account_id, accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(newTx.account_id)),
    [accounts, newTx.account_id]
  );
  const newTxCurrencies = sortCurrenciesRubFirst(
    (selectedAccount?.balances || []).map(b => b.currency)
  );
  const selectedTargetAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(newTx.to_account_id)),
    [accounts, newTx.to_account_id]
  );
  const newTxTargetCurrencies = sortCurrenciesRubFirst(
    (selectedTargetAccount?.balances || []).map(b => b.currency)
  );
  const sameNewTransferCurrency = newTx.type === "transfer"
    && Boolean(newTx.currency)
    && newTx.currency === newTx.to_currency;

  useEffect(() => {
    if (newTx.type !== "transfer" || !selectedTargetAccount) return;
    if (!newTxTargetCurrencies.includes(newTx.to_currency)) {
      setNewTx(current => ({ ...current, to_currency: newTxTargetCurrencies[0] || "", to_amount: "" }));
    }
  }, [newTx.type, selectedTargetAccount, newTxTargetCurrencies.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyNewTransferQuote = useCallback(toAmount => {
    setNewTx(current => current.to_amount === toAmount ? current : { ...current, to_amount: toAmount });
  }, []);
  const { loading: newQuoteLoading } = useTransferQuote({
    enabled: newTx.type === "transfer" && !sameNewTransferCurrency,
    amount: newTx.amount,
    fromCurrency: newTx.currency,
    toCurrency: newTx.to_currency,
    onQuote: applyNewTransferQuote,
  });
  const newDisplayedRate = Number(newTx.amount) > 0 && Number(newTx.to_amount) > 0
    ? Number(newTx.to_amount) / Number(newTx.amount)
    : null;

  const swapNewTransferAccounts = () => {
    if (!newTx.account_id || !newTx.to_account_id) return;
    const creditedAmount = sameNewTransferCurrency ? newTx.amount : newTx.to_amount;
    setNewTx(current => ({
      ...current,
      account_id: current.to_account_id,
      currency: current.to_currency,
      amount: creditedAmount || "",
      to_account_id: current.account_id,
      to_currency: current.currency,
      to_amount: current.amount || "",
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (newTx.type === "transfer") {
        if (!newTx.to_account_id) { setError("Выберите счёт-получатель"); return; }
        if (String(newTx.to_account_id) === String(newTx.account_id)) {
          setError("Счёт-источник и получатель совпадают"); return;
        }
        if (!newTx.to_currency) { setError("Выберите валюту счёта-получателя"); return; }
        if (!sameNewTransferCurrency && !(parseFloat(newTx.to_amount) > 0)) {
          setError("Введите сумму зачисления"); return;
        }
      }
      const payload = {
        amount: parseFloat(newTx.amount),
        type: newTx.type,
        currency: newTx.currency || undefined,
        description: newTx.description || undefined,
        account_id: parseInt(newTx.account_id),
        category_id: newTx.type === "transfer" || !newTx.category_id ? undefined : parseInt(newTx.category_id),
        to_account_id: newTx.type === "transfer" ? parseInt(newTx.to_account_id) : undefined,
        to_amount: newTx.type === "transfer" ? parseFloat(sameNewTransferCurrency ? newTx.amount : newTx.to_amount) : undefined,
        to_currency: newTx.type === "transfer" ? newTx.to_currency : undefined,
        fee_amount: newTx.type === "transfer" && Number(newTx.fee_amount) > 0 ? parseFloat(newTx.fee_amount) : undefined,
        fee_category_id: newTx.type === "transfer" && newTx.fee_category_id ? parseInt(newTx.fee_category_id) : undefined,
      };
      if (newTx.date) payload.date = new Date(newTx.date).toISOString();
      const requestKey = idempotencyKeyFor(createRequestRef, payload);
      const result = await submitOrQueueTransaction(payload, requestKey);
      clearIdempotencyKey(createRequestRef);
      setNewTx(t => ({ ...t, amount: "", description: "", category_id: "", fee_amount: "", fee_category_id: "" }));
      setEditing(null);
      setPage(0);
      if (!result.queued) {
        loadTransactions();
        loadAccounts(); // обновим балансы
      } else {
        setError("Запись сохранена на устройстве и отправится автоматически при появлении связи");
      }
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка создания");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Удалить транзакцию?")) return;
    try {
      await api.delete(`/api/transactions/${id}`);
      loadTransactions();
      loadAccounts();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка удаления");
    }
  };

  const accountName = (id) => accounts.find(a => a.id === id)?.name || id;
  const categoryNameFor = (id) => {
    const c = categories.find(c => c.id === id);
    if (!c) return "—";
    const parent = c.parent_id ? categories.find(p => p.id === c.parent_id) : null;
    return parent ? `${parent.name} → ${c.name}` : c.name;
  };
  const formatDate = (iso) => new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });

  const filteredCategoriesForCreate = newTx.type === "transfer"
    ? categories : categories.filter(c => c.type === newTx.type);

  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const showingFrom = data.total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min((page + 1) * PAGE_SIZE, data.total);

  const setFilter = (key, value) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    setPage(0);
    // отражаем активные фильтры в URL
    const params = {};
    Object.entries(next).forEach(([k, v]) => { if (v) params[k] = v; });
    setSearchParams(params, { replace: true });
  };

  const resetFilters = () => {
    setFilters({ account_id: "", currency: "", category_id: "", type: "", date_from: "", date_to: "", q: "" });
    setPage(0);
    setSearchParams({}, { replace: true });
  };

  const hasFilters = Object.values(filters).some(v => v);

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

      {/* Форма создания */}
      {editing === "new" && (
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
              {user?.plan === "family" && <Link className="quick-template-link" to="/settings/templates">Шаблоны</Link>}
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

      {/* Таблица */}
      {data.items.length > 0 && (
        <div className="table-wrap transactions-desktop-table" style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 8,
        }}>
          <table>
            <thead>
              <tr>
                <Th>Дата</Th>
                <Th>Тип</Th>
                <Th align="right">Сумма</Th>
                <Th>Счёт</Th>
                <Th>Категория</Th>
                <Th>Описание</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(tx => (
                editing === tx.id
                  ? <EditRow
                      key={tx.id} tx={tx}
                      accounts={accounts} accountGroups={accountGroups} categories={categories}
                      onCancel={() => setEditing(null)}
                      onSaved={() => { setEditing(null); loadTransactions(); loadAccounts(); }}
                    />
                  : <Row
                      key={tx.id} tx={tx}
                      accountName={accountName} categoryName={categoryNameFor}
                      formatDate={formatDate}
                      onEdit={() => setEditing(tx.id)}
                      onDelete={() => handleDelete(tx.id)}
                    />
              ))}
            </tbody>
          </table>
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
                formatDate={formatDate}
                onEdit={() => setEditing(editing === tx.id ? null : tx.id)}
                onDelete={() => handleDelete(tx.id)}
              />
              {editing === tx.id && (
                <table className="transactions-mobile-edit"><tbody><EditRow
                  tx={tx} accounts={accounts} accountGroups={accountGroups} categories={categories}
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

// === components ===

function Th({ children, align = "left" }) {
  return (
    <th style={{
      padding: "10px 12px", textAlign: align,
    }}>
      {children}
    </th>
  );
}

function Row({ tx, accountName, categoryName, formatDate, onEdit, onDelete }) {
  return (
    <tr style={{ borderTop: "1px solid #ece6d8" }}>
      <td style={{ padding: "8px 12px", color: "#7a8590", fontSize: 13, whiteSpace: "nowrap" }}>
        {formatDate(tx.date)}
      </td>
      <td style={{ padding: "8px 12px", color: TYPE_COLOR[tx.type], fontWeight: 500, fontSize: 13 }}>
        {TYPE_ICON[tx.type]} {TYPE_LABEL[tx.type]}
      </td>
      <td style={{
        padding: "8px 12px", textAlign: "right",
        fontWeight: 600, color: TYPE_COLOR[tx.type], whiteSpace: "nowrap",
      }}>
        {tx.type === "expense" ? "−" : tx.type === "transfer" ? "" : "+"}{formatMoney(tx.amount)} {currencySymbol(tx.currency)}
      </td>
      <td style={{ padding: "8px 12px", fontSize: 13 }}>{accountName(tx.account_id)}</td>
      <td style={{ padding: "8px 12px", fontSize: 13 }}>
        {tx.type === "transfer"
          ? <span style={{ color: "#2f6296" }}>→ {accountName(tx.to_account_id)}</span>
          : (tx.category_id ? categoryName(tx.category_id) : "—")}
      </td>
      <td style={{
        padding: "8px 12px", color: "#515c68", fontSize: 13,
        maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }} title={tx.description}>
        {tx.description || "—"}
      </td>
      <td style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>
        <button className="btn-ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={onEdit}>
          ✎
        </button>
        <button className="btn-ghost" style={{ padding: "3px 8px", fontSize: 12, color: "#c0432b", marginLeft: 4 }} onClick={onDelete}>
          ×
        </button>
      </td>
    </tr>
  );
}

function MobileTransactionCard({ tx, accountName, categoryName, formatDate, onEdit, onDelete }) {
  const category = tx.type === "transfer"
    ? `→ ${accountName(tx.to_account_id)}`
    : (tx.category_id ? categoryName(tx.category_id) : "Без категории");
  const title = tx.description || category || TYPE_LABEL[tx.type];
  return (
    <article className="mobile-transaction-card">
      <button type="button" className="mobile-transaction-main" onClick={onEdit} aria-label={`Изменить запись ${title}`}>
        <span className="mobile-transaction-icon" style={{ color: TYPE_COLOR[tx.type] }}>{TYPE_ICON[tx.type]}</span>
        <span className="mobile-transaction-copy">
          <strong>{title}</strong>
          <small>{formatDate(tx.date)} · {accountName(tx.account_id)} · {category}</small>
        </span>
        <span className="mobile-transaction-amount" style={{ color: TYPE_COLOR[tx.type] }}>
          {tx.type === "expense" ? "−" : tx.type === "income" ? "+" : ""}{formatMoney(tx.amount)} {currencySymbol(tx.currency)}
        </span>
      </button>
      <button type="button" className="mobile-transaction-delete btn-ghost" onClick={onDelete} aria-label={`Удалить запись ${title}`}>×</button>
    </article>
  );
}

function EditRow({ tx, accounts, accountGroups, categories, onCancel, onSaved }) {
  const [form, setForm] = useState({
    amount: String(tx.amount),
    type: tx.type,
    currency: tx.currency,
    account_id: String(tx.account_id),
    category_id: tx.category_id ? String(tx.category_id) : "",
    to_account_id: tx.to_account_id ? String(tx.to_account_id) : "",
    to_amount: tx.to_amount != null ? String(tx.to_amount) : "",
    to_currency: tx.to_currency || "",
    fee_amount: tx.fee_amount != null ? String(tx.fee_amount) : "",
    fee_category_id: tx.fee_category_id ? String(tx.fee_category_id) : "",
    description: tx.description || "",
    date: new Date(tx.date).toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const acc = accounts.find(a => String(a.id) === form.account_id);
  const accCurrencies = sortCurrenciesRubFirst(
    (acc?.balances || []).map(b => b.currency)
  );
  const targetAccount = accounts.find(a => String(a.id) === form.to_account_id);
  const targetCurrencies = sortCurrenciesRubFirst(
    (targetAccount?.balances || []).map(b => b.currency)
  );
  const displayedRate = Number(form.amount) > 0 && Number(form.to_amount) > 0
    ? Number(form.to_amount) / Number(form.amount)
    : null;
  const sameTransferCurrency = form.type === "transfer"
    && Boolean(form.currency)
    && form.currency === form.to_currency;
  const cats = form.type === "transfer" ? [] : categories.filter(c => c.type === form.type);

  const save = async () => {
    if (form.type === "transfer") {
      if (!form.to_account_id) { setErr("Выберите счёт-получатель"); return; }
      if (String(form.to_account_id) === String(form.account_id)) {
        setErr("Счёт-источник и получатель совпадают"); return;
      }
      if (!form.to_currency) { setErr("Выберите валюту счёта-получателя"); return; }
      if (!sameTransferCurrency && !(parseFloat(form.to_amount) > 0)) { setErr("Введите сумму зачисления"); return; }
    }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        amount: parseFloat(form.amount),
        type: form.type,
        currency: form.currency,
        account_id: parseInt(form.account_id),
        category_id: form.type === "transfer" || !form.category_id ? null : parseInt(form.category_id),
        to_account_id: form.type === "transfer" ? parseInt(form.to_account_id) : null,
        to_amount: form.type === "transfer" ? parseFloat(sameTransferCurrency ? form.amount : form.to_amount) : null,
        to_currency: form.type === "transfer" ? form.to_currency : null,
        fee_amount: form.type === "transfer" && Number(form.fee_amount) > 0 ? parseFloat(form.fee_amount) : null,
        fee_category_id: form.type === "transfer" && form.fee_category_id ? parseInt(form.fee_category_id) : null,
        description: form.description || null,
        date: new Date(form.date).toISOString(),
      };
      await api.patch(`/api/transactions/${tx.id}`, payload);
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.detail || "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr style={{ background: "#fefce8", borderTop: "2px solid #facc15" }}>
      <td colSpan={7} style={{ padding: 12 }}>
        {err && <div style={{ color: "#c0432b", fontSize: 13, marginBottom: 6 }}>{err}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value, category_id: "" })}>
            <option value="expense">Расход</option>
            <option value="income">Доход</option>
            <option value="transfer">Перевод</option>
          </select>
          <AmountInput
            type="number" step="0.01" value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            inputStyle={{ width: 110, textAlign: "right" }}
          />
          <CurrencyField currencies={accCurrencies.length ? accCurrencies : [form.currency]} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
          <select value={form.account_id} onChange={e => {
            const account = accounts.find(item => String(item.id) === e.target.value);
            const currencies = sortCurrenciesRubFirst((account?.balances || []).map(b => b.currency));
            setForm({ ...form, account_id: e.target.value, currency: currencies[0] || form.currency });
          }}>
            <AccountOptions groups={accountGroups} includeIds={[form.account_id]} />
          </select>
          {form.type === "transfer" ? (
            <>
              <button type="button" className="transfer-swap-button" disabled={!form.to_account_id} onClick={() => {
                const creditedAmount = sameTransferCurrency ? form.amount : form.to_amount;
                setForm(current => ({ ...current, account_id: current.to_account_id, currency: current.to_currency, amount: creditedAmount || "", to_account_id: current.account_id, to_currency: current.currency, to_amount: current.amount || "" }));
              }} aria-label="Поменять счета отправки и получения местами" title="Поменять счета местами">⇄</button>
              <select value={form.to_account_id} onChange={e => {
                const account = accounts.find(item => String(item.id) === e.target.value);
                const currencies = sortCurrenciesRubFirst((account?.balances || []).map(b => b.currency));
                setForm({
                  ...form,
                  to_account_id: e.target.value,
                  to_currency: currencies[0] || "",
                  to_amount: "",
                });
              }} required>
                <option value="">— На счёт —</option>
                <AccountOptions
                  groups={accountGroups}
                  excludeId={form.account_id}
                  includeIds={[form.to_account_id]}
                />
              </select>
              {!sameTransferCurrency && <AmountInput
                type="number"
                step="0.01"
                min="0.01"
                value={form.to_amount}
                onChange={e => setForm({ ...form, to_amount: e.target.value })}
                placeholder="Зачислено"
                inputStyle={{ width: 110, textAlign: "right" }}
              />}
              <CurrencyField
                currencies={targetCurrencies.length ? targetCurrencies : [form.to_currency].filter(Boolean)}
                value={form.to_currency}
                onChange={e => setForm({ ...form, to_currency: e.target.value })}
              />
              {form.currency && form.to_currency && form.currency !== form.to_currency && displayedRate && (
                <span style={{ color: "#7a8590", fontSize: 12 }}>
                  1 {form.currency} = {displayedRate.toLocaleString("ru-RU", { maximumFractionDigits: 8 })} {form.to_currency}
                </span>
              )}
              <AmountInput type="number" step="0.01" min="0" value={form.fee_amount} onChange={e => setForm({ ...form, fee_amount: e.target.value })} placeholder="Комиссия" inputStyle={{ width: 110, textAlign: "right" }} />
              <CategoryPicker categories={categories.filter(c => c.type === "expense")} value={form.fee_category_id} onChange={fee_category_id => setForm({ ...form, fee_category_id })} placeholder="Категория комиссии" style={{ minWidth: 180 }} />
            </>
          ) : (
            <CategoryPicker
              categories={cats}
              value={form.category_id}
              onChange={category_id => setForm({ ...form, category_id })}
              placeholder="— Без категории —"
              style={{ minWidth: 180 }}
            />
          )}
          <input
            placeholder="Описание"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            style={{ flex: 1, minWidth: 180 }}
          />
          <button onClick={save} disabled={saving}>{saving ? "..." : "OK"}</button>
          <button className="btn-ghost" onClick={onCancel}>Отмена</button>
        </div>
      </td>
    </tr>
  );
}

function Pagination({ page, totalPages, onChange }) {
  const go = (p) => onChange(Math.max(0, Math.min(totalPages - 1, p)));
  // Показываем "± 2" вокруг текущей + первая/последняя
  const pages = new Set([0, totalPages - 1, page]);
  for (let d = 1; d <= 2; d++) {
    if (page - d >= 0) pages.add(page - d);
    if (page + d < totalPages) pages.add(page + d);
  }
  const list = Array.from(pages).sort((a, b) => a - b);

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
      <button className="btn-ghost" disabled={page === 0} onClick={() => go(page - 1)}
        style={{ padding: "4px 10px" }}>‹</button>
      {list.map((p, i) => {
        const prev = list[i - 1];
        const gap = prev !== undefined && p - prev > 1;
        return (
          <span key={p} style={{ display: "flex", gap: 4 }}>
            {gap && <span style={{ color: "#a6afb8", padding: "0 4px" }}>…</span>}
            <button
              type="button"
              onClick={() => go(p)}
              className={p === page ? "" : "btn-ghost"}
              style={{
                padding: "4px 10px", fontSize: 13,
                minWidth: 32, fontWeight: p === page ? 600 : 400,
              }}
            >
              {p + 1}
            </button>
          </span>
        );
      })}
      <button className="btn-ghost" disabled={page === totalPages - 1} onClick={() => go(page + 1)}
        style={{ padding: "4px 10px" }}>›</button>
    </div>
  );
}
