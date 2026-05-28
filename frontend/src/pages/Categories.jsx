import { useState, useEffect } from "react";
import api from "../api/client";

const TYPE_LABEL = { income: "Доход", expense: "Расход" };
const TYPE_COLOR = { income: "#22c55e", expense: "#ef4444" };

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: "", type: "expense", color: "#6366f1", icon: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCategories = async () => {
    try {
      const res = await api.get("/api/categories/");
      setCategories(res.data);
    } catch {
      setError("Ошибка загрузки категорий");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCategories(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (!payload.icon) delete payload.icon;
      await api.post("/api/categories/", payload);
      setForm({ name: "", type: form.type, color: "#6366f1", icon: "" });
      fetchCategories();
    } catch {
      setError("Ошибка создания категории");
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/categories/${id}`);
      fetchCategories();
    } catch {
      setError("Нельзя удалить категорию (возможно, это системная)");
    }
  };

  if (loading) return <div className="page">Загрузка...</div>;

  const expense = categories.filter(c => c.type === "expense");
  const income = categories.filter(c => c.type === "income");

  return (
    <div className="page">
      <h1>Категории</h1>

      {error && <p style={{ color: "#ef4444", marginBottom: 12 }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          style={{
            color: TYPE_COLOR[form.type],
            fontWeight: 600,
          }}
        >
          <option value="expense">Расход</option>
          <option value="income">Доход</option>
        </select>
        <input
          placeholder="Название"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          placeholder="Иконка (emoji)"
          value={form.icon}
          onChange={(e) => setForm({ ...form, icon: e.target.value })}
          style={{ width: 90 }}
        />
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          title="Цвет"
          style={{ width: 44, padding: 4, cursor: "pointer" }}
        />
        <button type="submit">Добавить</button>
      </form>

      <CategorySection title="Расходы" items={expense} color="#ef4444" onDelete={handleDelete} />
      <div style={{ height: 24 }} />
      <CategorySection title="Доходы" items={income} color="#22c55e" onDelete={handleDelete} />
    </div>
  );
}

function CategorySection({ title, items, color, onDelete }) {
  return (
    <div>
      <h3 style={{
        fontSize: 13, color: "#64748b", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: 0.5,
        marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
        {title} <span style={{ color: "#94a3b8" }}>({items.length})</span>
      </h3>

      {items.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>Нет категорий</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Иконка</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Название</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Цвет</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Системная</th>
                <th style={{ padding: "10px 12px" }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((cat) => (
                <tr key={cat.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 12px", fontSize: 20 }}>{cat.icon || "—"}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{cat.name}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: 4,
                        background: cat.color, display: "inline-block",
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 13, color: "#64748b" }}>{cat.color}</span>
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#64748b", fontSize: 13 }}>{cat.is_default ? "Да" : "Нет"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {!cat.is_default && (
                      <button className="btn-danger" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => onDelete(cat.id)}>
                        Удалить
                      </button>
                    )}
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
