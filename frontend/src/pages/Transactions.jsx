import { useState, useEffect, useMemo } from "react";
import api from "../api/client";
import { COMMON_CURRENCIES, currencySymbol } from "../utils/money";

const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" };
const TYPE_COLOR = { income: "#15803d", expense: "#b91c1c", transfer: "#1d4ed8" };

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    amount: "", type: "expense", currency: "",
    description: "", account_id: "", category_id: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = async () => {
    try {
      const [txRes, accRes, catRes] = await Promise.all([
        api.get("/api/transactions/"),
        api.get("/api/accounts/"),
        api.get("/api/categories/"),
      ]);
      setTransactions(txRes.data);
      setAccounts(accRes.data);
      setCategories(catRes.data);
      if (accRes.data.length > 0 && !form.account_id) {
        const firstAcc = accRes.data[0];
        setForm(f => ({
          ...f,
          account_id: String(firstAcc.id),
          currency: firstAcc.balances?.[0]?.currency || "RUB",
        }));
      }
    } catch {
      setError("Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // При смене счёта — переключиться на его первую валюту, если текущей нет
  useEffect(() => {
    if (!form.account_id || !accounts.length) return;
    const acc = accounts.find(a => String(a.id) === String(form.account_id));
    if (!acc?.balances?.length) return;
    const codes = acc.balances.map(b => b.currency);
    if (!codes.includes(form.currency)) {
      setForm(f => ({ ...f, currency: codes[0] }));
    }
  }, [form.account_id, accounts]);  // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(form.account_id)),
    [accounts, form.account_id]
  );
  const accountCurrencies = (selectedAccount?.balances || []).map(b => b.currency);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/transactions/", {
        amount: parseFloat(form.amount),
        type: form.type,
        currency: form.currency || undefined,
        description: form.description || undefined,
        account_id: parseInt(form.account_id),
        category_id: form.category_id ? parseInt(form.category_id) : undefined,
      });
      setForm(f => ({ ...f, amount: "", description: "", category_id: "" }));
      fetchAll();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка создания транзакции");
    }
  };

  const filteredCategories = form.type === "transfer"
    ? categories
    : categories.filter(c => c.type === form.type);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/transactions/${id}`);
      fetchAll();
    } catch {
      setError("Ошибка удаления транзакции");
    }
  };

  const accountName = (id) => accounts.find(a => a.id === id)?.name || id;
  const categoryName = (id) => {
    const c = categories.find(c => c.id === id);
    return c ? `${c.icon ? c.icon + " " : ""}${c.name}` : "—";
  };

  const formatDate = (iso) => new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });

  if (loading) return <div className="page">Загрузка...</div>;

  return (
    <div className="page">
      <h1>Транзакции</h1>

      {error && <p style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <select
          value={form.type}
          onChange={e => setForm({ ...form, type: e.target.value, category_id: "" })}
        >
          <option value="expense">Расход</option>
          <option value="income">Доход</option>
          <option value="transfer">Перевод</option>
        </select>
        <input
          type="number" placeholder="Сумма"
          value={form.amount}
          min="0.01" step="0.01"
          onChange={e => setForm({ ...form, amount: e.target.value })}
          required
          style={{ width: 110 }}
        />
        <select
          value={form.currency}
          onChange={e => setForm({ ...form, currency: e.target.value })}
          style={{ width: 90 }}
        >
          {accountCurrencies.length > 0
            ? accountCurrencies.map(c => <option key={c} value={c}>{c}</option>)
            : COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)
          }
        </select>
        <select
          value={form.account_id}
          onChange={e => setForm({ ...form, account_id: e.target.value })}
          required
        >
          <option value="">— Счёт —</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select
          value={form.category_id}
          onChange={e => setForm({ ...form, category_id: e.target.value })}
        >
          <option value="">— Категория —</option>
          {filteredCategories.map(c => (
            <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>
          ))}
        </select>
        <input
          placeholder="Описание"
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
        />
        <button type="submit">Добавить</button>
      </form>

      {transactions.length === 0 ? (
        <p style={{ color: "#a8a29e" }}>Нет транзакций. Добавьте первую!</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr style={{ background: "#faf8f3" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#78716c" }}>Дата</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#78716c" }}>Тип</th>
                <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#78716c" }}>Сумма</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#78716c" }}>Счёт</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#78716c" }}>Категория</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#78716c" }}>Описание</th>
                <th style={{ padding: "10px 12px" }}></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id} style={{ borderTop: "1px solid #ede9df" }}>
                  <td style={{ padding: "10px 12px", color: "#a8a29e", fontSize: 13, whiteSpace: "nowrap" }}>{formatDate(tx.date)}</td>
                  <td style={{ padding: "10px 12px", color: TYPE_COLOR[tx.type], fontWeight: 500, fontSize: 13 }}>{TYPE_LABEL[tx.type]}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: TYPE_COLOR[tx.type], whiteSpace: "nowrap" }}>
                    {tx.type === "expense" ? "−" : "+"}{tx.amount.toLocaleString("ru-RU")} {currencySymbol(tx.currency)}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>{accountName(tx.account_id)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>{tx.category_id ? categoryName(tx.category_id) : "—"}</td>
                  <td style={{ padding: "10px 12px", color: "#78716c", fontSize: 13 }}>{tx.description || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <button className="btn-danger" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => handleDelete(tx.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
