import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { COMMON_CURRENCIES, currencySymbol, formatMoney } from "../utils/money";

const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" };
const TYPE_COLOR = { income: "#15803d", expense: "#b91c1c", transfer: "#1d4ed8" };
const PAGE_SIZE = 50;

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ items: [], total: 0 });
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);    // tx id или 'new'

  // Фильтры — инициализируются из URL (для глубоких ссылок из Annual)
  const [filters, setFilters] = useState(() => ({
    account_id: searchParams.get("account_id") || "",
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
    description: "", account_id: "", category_id: "",
    date: isoToday(),
  });

  const loadAccounts = useCallback(async () => {
    const [acc, cat] = await Promise.all([
      api.get("/api/accounts/"),
      api.get("/api/categories/"),
    ]);
    setAccounts(acc.data);
    setCategories(cat.data);
    if (acc.data.length > 0 && !newTx.account_id) {
      const first = acc.data[0];
      setNewTx(t => ({
        ...t,
        account_id: String(first.id),
        currency: first.balances?.[0]?.currency || "RUB",
      }));
    }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await api.get("/api/transactions/", { params });
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadTransactions(); }, [loadTransactions]);

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
    const codes = acc.balances.map(b => b.currency);
    if (!codes.includes(newTx.currency)) {
      setNewTx(t => ({ ...t, currency: codes[0] }));
    }
  }, [newTx.account_id, accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(newTx.account_id)),
    [accounts, newTx.account_id]
  );
  const newTxCurrencies = (selectedAccount?.balances || []).map(b => b.currency);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        amount: parseFloat(newTx.amount),
        type: newTx.type,
        currency: newTx.currency || undefined,
        description: newTx.description || undefined,
        account_id: parseInt(newTx.account_id),
        category_id: newTx.category_id ? parseInt(newTx.category_id) : undefined,
      };
      if (newTx.date) payload.date = new Date(newTx.date).toISOString();
      await api.post("/api/transactions/", payload);
      setNewTx(t => ({ ...t, amount: "", description: "", category_id: "" }));
      setEditing(null);
      setPage(0);
      loadTransactions();
      loadAccounts(); // обновим балансы
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
    setFilters({ account_id: "", category_id: "", type: "", date_from: "", date_to: "", q: "" });
    setPage(0);
    setSearchParams({}, { replace: true });
  };

  const hasFilters = Object.values(filters).some(v => v);

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Транзакции</h1>
        <button
          type="button"
          onClick={() => setEditing(editing === "new" ? null : "new")}
        >
          {editing === "new" ? "Отмена" : "+ Добавить"}
        </button>
      </div>

      {error && (
        <div style={{
          color: "#b91c1c", padding: "8px 12px",
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
          background: "#fff", border: "1px solid #e7e5e0", borderRadius: 10,
          padding: 14, marginBottom: 16,
          display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        }}>
          <select value={newTx.type} onChange={e => setNewTx({ ...newTx, type: e.target.value, category_id: "" })}>
            <option value="expense">Расход</option>
            <option value="income">Доход</option>
            <option value="transfer">Перевод</option>
          </select>
          <input
            type="number" placeholder="Сумма" min="0.01" step="0.01"
            value={newTx.amount}
            onChange={e => setNewTx({ ...newTx, amount: e.target.value })}
            required style={{ width: 110 }}
          />
          <select value={newTx.currency} onChange={e => setNewTx({ ...newTx, currency: e.target.value })} style={{ width: 90 }}>
            {(newTxCurrencies.length ? newTxCurrencies : COMMON_CURRENCIES).map(c =>
              <option key={c} value={c}>{c}</option>
            )}
          </select>
          <select value={newTx.account_id} onChange={e => setNewTx({ ...newTx, account_id: e.target.value })} required>
            <option value="">— Счёт —</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={newTx.category_id} onChange={e => setNewTx({ ...newTx, category_id: e.target.value })}>
            <option value="">— Категория —</option>
            {filteredCategoriesForCreate.map(c => (
              <option key={c.id} value={c.id}>{categoryNameFor(c.id)}</option>
            ))}
          </select>
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
      <div style={{
        background: "#fff", border: "1px solid #e7e5e0", borderRadius: 10,
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
          {categories.filter(c => !c.parent_id).map(c => (
            <optgroup key={c.id} label={c.name}>
              <option value={c.id}>{c.name} (все)</option>
              {categories.filter(ch => ch.parent_id === c.id).map(ch => (
                <option key={ch.id} value={ch.id}>{c.name} → {ch.name}</option>
              ))}
            </optgroup>
          ))}
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
        {hasFilters && (
          <button className="btn-ghost" onClick={resetFilters}>Сбросить</button>
        )}
      </div>

      {/* Pagination header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 8, fontSize: 13, color: "#78716c",
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
        <div className="table-wrap" style={{
          background: "#fff", border: "1px solid #e7e5e0", borderRadius: 8,
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
                      accounts={accounts} categories={categories}
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
    <tr style={{ borderTop: "1px solid #ede9df" }}>
      <td style={{ padding: "8px 12px", color: "#78716c", fontSize: 13, whiteSpace: "nowrap" }}>
        {formatDate(tx.date)}
      </td>
      <td style={{ padding: "8px 12px", color: TYPE_COLOR[tx.type], fontWeight: 500, fontSize: 13 }}>
        {TYPE_LABEL[tx.type]}
      </td>
      <td style={{
        padding: "8px 12px", textAlign: "right",
        fontWeight: 600, color: TYPE_COLOR[tx.type], whiteSpace: "nowrap",
      }}>
        {tx.type === "expense" ? "−" : "+"}{formatMoney(tx.amount)} {currencySymbol(tx.currency)}
      </td>
      <td style={{ padding: "8px 12px", fontSize: 13 }}>{accountName(tx.account_id)}</td>
      <td style={{ padding: "8px 12px", fontSize: 13 }}>
        {tx.category_id ? categoryName(tx.category_id) : "—"}
      </td>
      <td style={{
        padding: "8px 12px", color: "#57534e", fontSize: 13,
        maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }} title={tx.description}>
        {tx.description || "—"}
      </td>
      <td style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>
        <button className="btn-ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={onEdit}>
          ✎
        </button>
        <button className="btn-ghost" style={{ padding: "3px 8px", fontSize: 12, color: "#b91c1c", marginLeft: 4 }} onClick={onDelete}>
          ×
        </button>
      </td>
    </tr>
  );
}

function EditRow({ tx, accounts, categories, onCancel, onSaved }) {
  const [form, setForm] = useState({
    amount: String(tx.amount),
    type: tx.type,
    currency: tx.currency,
    account_id: String(tx.account_id),
    category_id: tx.category_id ? String(tx.category_id) : "",
    description: tx.description || "",
    date: new Date(tx.date).toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const acc = accounts.find(a => String(a.id) === form.account_id);
  const accCurrencies = (acc?.balances || []).map(b => b.currency);
  const cats = form.type === "transfer" ? categories : categories.filter(c => c.type === form.type);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        amount: parseFloat(form.amount),
        type: form.type,
        currency: form.currency,
        account_id: parseInt(form.account_id),
        category_id: form.category_id ? parseInt(form.category_id) : null,
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
        {err && <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 6 }}>{err}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value, category_id: "" })}>
            <option value="expense">Расход</option>
            <option value="income">Доход</option>
            <option value="transfer">Перевод</option>
          </select>
          <input
            type="number" step="0.01" value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            style={{ width: 110, textAlign: "right" }}
          />
          <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={{ width: 80 }}>
            {(accCurrencies.length ? accCurrencies : [form.currency]).map(c =>
              <option key={c} value={c}>{c}</option>
            )}
          </select>
          <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
            <option value="">— Без категории —</option>
            {cats.map(c => {
              const p = c.parent_id ? categories.find(x => x.id === c.parent_id) : null;
              return (
                <option key={c.id} value={c.id}>
                  {p ? `${p.name} → ${c.name}` : c.name}
                </option>
              );
            })}
          </select>
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
            {gap && <span style={{ color: "#a8a29e", padding: "0 4px" }}>…</span>}
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
