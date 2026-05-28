import { useState, useEffect } from "react";
import api from "../api/client";

const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" };
const TYPE_COLOR = { income: "#22c55e", expense: "#ef4444", transfer: "#3b82f6" };

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ amount: "", type: "expense", description: "", account_id: "", category_id: "" });
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
        setForm(f => ({ ...f, account_id: String(accRes.data[0].id) }));
      }
    } catch {
      setError("Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/transactions/", {
        amount: parseFloat(form.amount),
        type: form.type,
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

  // Категории, релевантные выбранному типу транзакции. Для transfer показываем все.
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

      {error && <p style={{ color: "#ef4444", marginBottom: 12 }}>{error}</p>}

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
          type="number"
          placeholder="Сумма"
          value={form.amount}
          min="0.01"
          step="0.01"
          onChange={e => setForm({ ...form, amount: e.target.value })}
          required
          style={{ width: 110 }}
        />
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
        <p style={{ color: "#94a3b8" }}>Нет транзакций. Добавьте первую!</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Дата</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Тип</th>
                <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#64748b" }}>Сумма</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Счёт</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Категория</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Описание</th>
                <th style={{ padding: "10px 12px" }}></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 12px", color: "#94a3b8", fontSize: 13, whiteSpace: "nowrap" }}>{formatDate(tx.date)}</td>
                  <td style={{ padding: "10px 12px", color: TYPE_COLOR[tx.type], fontWeight: 500, fontSize: 13 }}>{TYPE_LABEL[tx.type]}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: TYPE_COLOR[tx.type], whiteSpace: "nowrap" }}>
                    {tx.type === "expense" ? "−" : "+"}{tx.amount.toLocaleString("ru-RU")}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>{accountName(tx.account_id)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>{tx.category_id ? categoryName(tx.category_id) : "—"}</td>
                  <td style={{ padding: "10px 12px", color: "#64748b", fontSize: 13 }}>{tx.description || "—"}</td>
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
