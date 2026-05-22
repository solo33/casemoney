import { useState, useEffect } from "react";
import api from "../api/client";

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ name: "", type: "cash", currency: "RUB", balance: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAccounts = async () => {
    try {
      const res = await api.get("/api/accounts/");
      setAccounts(res.data);
    } catch (e) {
      setError("Ошибка загрузки счетов");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/accounts/", form);
      setForm({ name: "", type: "cash", currency: "RUB", balance: 0 });
      fetchAccounts();
    } catch (e) {
      setError("Ошибка создания счёта");
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/accounts/${id}`);
      fetchAccounts();
    } catch (e) {
      setError("Ошибка удаления счёта");
    }
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div style={{ padding: "20px" }}>
      <h1>Счета</h1>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ marginBottom: "20px" }}>
        <input
          placeholder="Название"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="cash">Наличные</option>
          <option value="card">Карта</option>
          <option value="bank">Банк</option>
          <option value="crypto">Крипто</option>
        </select>
        <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          <option value="RUB">RUB</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
        <input
          type="number"
          placeholder="Баланс"
          value={form.balance}
          onChange={(e) => setForm({ ...form, balance: parseFloat(e.target.value) })}
        />
        <button type="submit">Добавить счёт</button>
      </form>

      {accounts.length === 0 ? (
        <p>Нет счетов. Создайте первый!</p>
      ) : (
        <table border="1" cellPadding="8">
          <thead>
            <tr>
              <th>Название</th>
              <th>Тип</th>
              <th>Баланс</th>
              <th>Валюта</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc) => (
              <tr key={acc.id}>
                <td>{acc.name}</td>
                <td>{acc.type}</td>
                <td>{acc.balance}</td>
                <td>{acc.currency}</td>
                <td>
                  <button onClick={() => handleDelete(acc.id)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}