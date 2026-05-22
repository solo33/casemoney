import { useState, useEffect } from "react";
import api from "../api/client";

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: "", color: "#6366f1", icon: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCategories = async () => {
    try {
      const res = await api.get("/api/categories/");
      setCategories(res.data);
    } catch (e) {
      setError("Ошибка загрузки категорий");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (!payload.icon) delete payload.icon;
      await api.post("/api/categories/", payload);
      setForm({ name: "", color: "#6366f1", icon: "" });
      fetchCategories();
    } catch (e) {
      setError("Ошибка создания категории");
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/categories/${id}`);
      fetchCategories();
    } catch (e) {
      setError("Нельзя удалить категорию (возможно, это системная)");
    }
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div style={{ padding: "20px" }}>
      <h1>Категории</h1>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ marginBottom: "20px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          placeholder="Название"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          type="text"
          placeholder="Иконка (emoji)"
          value={form.icon}
          onChange={(e) => setForm({ ...form, icon: e.target.value })}
          style={{ width: "80px" }}
        />
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          title="Цвет"
        />
        <button type="submit">Добавить</button>
      </form>

      {categories.length === 0 ? (
        <p>Нет категорий.</p>
      ) : (
        <table border="1" cellPadding="8">
          <thead>
            <tr>
              <th>Иконка</th>
              <th>Название</th>
              <th>Цвет</th>
              <th>Системная</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id}>
                <td>{cat.icon || "—"}</td>
                <td>{cat.name}</td>
                <td>
                  <span style={{
                    display: "inline-block",
                    width: 20,
                    height: 20,
                    backgroundColor: cat.color,
                    borderRadius: 4,
                    verticalAlign: "middle",
                    marginRight: 6,
                  }} />
                  {cat.color}
                </td>
                <td>{cat.is_default ? "Да" : "Нет"}</td>
                <td>
                  {!cat.is_default && (
                    <button onClick={() => handleDelete(cat.id)}>Удалить</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
