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
    } catch {
      setError("Ошибка загрузки счетов");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/accounts/", form);
      setForm({ name: "", type: "cash", currency: "RUB", balance: 0 });
      fetchAccounts();
    } catch {
      setError("Ошибка создания счёта");
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/accounts/${id}`);
      fetchAccounts();
    } catch {
      setError("Ошибка удаления счёта");
    }
  };

  if (loading) return <div className="page">Загрузка...</div>;

  return (
    <div className="page">
      <h1>Счета</h1>

      {error && <p style={{ color: "#ef4444", marginBottom: 12 }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
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
          style={{ width: 110 }}
          onChange={(e) => setForm({ ...form, balance: parseFloat(e.target.value) })}
        />
        <button type="submit">Добавить счёт</button>
      </form>

      {accounts.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>Нет счетов. Создайте первый!</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Название</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Тип</th>
                <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#64748b" }}>Баланс</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Валюта</th>
                <th style={{ padding: "10px 12px" }}></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{acc.name}</td>
                  <td style={{ padding: "10px 12px", color: "#64748b" }}>{acc.type}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{acc.balance.toLocaleString("ru-RU")}</td>
                  <td style={{ padding: "10px 12px", color: "#64748b" }}>{acc.currency}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <button className="btn-danger" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => handleDelete(acc.id)}>Удалить</button>
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
