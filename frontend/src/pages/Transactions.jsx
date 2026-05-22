import { useState, useEffect } from "react";
import api from "../api/client";

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    amount: "",
    type: "expense",
    description: "",
    account_id: "",
    category_id: "",
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
        setForm((f) => ({ ...f, account_id: String(accRes.data[0].id) }));
      }
    } catch (e) {
      setError("Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        amount: parseFloat(form.amount),
        type: form.type,
        description: form.description || undefined,
        account_id: parseInt(form.account_id),
        category_id: form.category_id ? parseInt(form.category_id) : undefined,
      };
      await api.post("/api/transactions/", payload);
      setForm((f) => ({ ...f, amount: "", description: "", category_id: "" }));
      fetchAll();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка создания транзакции");
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/transactions/${id}`);
      fetchAll();
    } catch (e) {
      setError("Ошибка удаления транзакции");
    }
  };

  const accountName = (id) => accounts.find((a) => a.id === id)?.name || id;
  const categoryName = (id) => categories.find((c) => c.id === id)?.name || "—";

  const typeLabel = { income: "Доход", expense: "Расход", transfer: "Перевод" };
  const typeColor = { income: "green", expense: "red", transfer: "blue" };

  const formatDate = (iso) => new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  if (loading) return <div>Загрузка...</div>;

  return (
    <div style={{ padding: "20px" }}>
      <h1>Транзакции</h1>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ marginBottom: "20px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
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
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          required
          style={{ width: "100px" }}
        />
        <select
          value={form.account_id}
          onChange={(e) => setForm({ ...form, account_id: e.target.value })}
          required
        >
          <option value="">— Счёт —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
        >
          <option value="">— Категория —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>
          ))}
        </select>
        <input
          placeholder="Описание"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button type="submit">Добавить</button>
      </form>

      {transactions.length === 0 ? (
        <p>Нет транзакций. Добавьте первую!</p>
      ) : (
        <table border="1" cellPadding="8">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Сумма</th>
              <th>Счёт</th>
              <th>Категория</th>
              <th>Описание</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td>{formatDate(tx.date)}</td>
                <td style={{ color: typeColor[tx.type] }}>{typeLabel[tx.type]}</td>
                <td style={{ color: typeColor[tx.type] }}>
                  {tx.type === "expense" ? "−" : "+"}{tx.amount.toLocaleString("ru-RU")}
                </td>
                <td>{accountName(tx.account_id)}</td>
                <td>{categoryName(tx.category_id)}</td>
                <td>{tx.description || "—"}</td>
                <td>
                  <button onClick={() => handleDelete(tx.id)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
