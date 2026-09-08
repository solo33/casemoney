import { useState, useCallback, useEffect } from "react";

import api from "../../api/client";

import { PAGE, uniqueUsers, th, td, adminBadge } from "../../utils/adminView";
import { PlanBadge, UserDetail } from "./AdminParts";

export function UsersTab({ adminId }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ q: "", is_active: "" });
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE, offset: page * PAGE };
      Object.entries(filters).forEach(([k, v]) => { if (v !== "") params[k] = v; });
      const r = await api.get("/api/admin/users", { params });
      setData({ ...r.data, items: uniqueUsers(r.data.items) });
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (k, v) => {
    setFilters(f => ({ ...f, [k]: v }));
    setPage(0);
  };

  const onUserChanged = () => {
    load();
    if (selected) {
      api.get(`/api/admin/users/${selected.id}`)
        .then(r => setSelected(r.data))
        .catch(() => {});
    }
  };

  const totalPages = Math.ceil(data.total / PAGE);

  return (
    <div className="admin-user-layout" style={{ display: "grid", gridTemplateColumns: selected ? "1fr 380px" : "1fr", gap: 16 }}>
      <div>
        {/* Фильтры */}
        <div style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
          padding: 12, marginBottom: 12,
          display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        }}>
          <input
            placeholder="Email или username..."
            value={filters.q}
            onChange={e => setFilter("q", e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <select value={filters.is_active} onChange={e => setFilter("is_active", e.target.value)}>
            <option value="">Все</option>
            <option value="true">Активные</option>
            <option value="false">Заблокированы</option>
          </select>
          {(filters.q || filters.is_active !== "") && (
            <button className="btn-ghost" onClick={() => setFilters({ q: "", is_active: "" })}>
              Сбросить
            </button>
          )}
        </div>

        {/* Pagination */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 8, fontSize: 13, color: "#7a8590",
        }}>
          <span>
            {loading ? "..." : data.total === 0 ? "Нет пользователей" :
              `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, data.total)} из ${data.total}`}
          </span>
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: 4 }}>
              <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}
                style={{ padding: "4px 10px" }}>‹</button>
              <span style={{ padding: "4px 10px" }}>{page + 1} / {totalPages}</span>
              <button className="btn-ghost" disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}
                style={{ padding: "4px 10px" }}>›</button>
            </div>
          )}
        </div>

        {error && <p style={{ color: "#c0432b" }}>{error}</p>}

        {/* Таблица */}
        <div className="table-wrap" style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 8,
        }}>
          <table style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Username</th>
                <th style={th}>План</th>
                <th style={th}>Статус</th>
                <th style={{ ...th, textAlign: "right" }}>Счета</th>
                <th style={{ ...th, textAlign: "right" }}>Категории</th>
                <th style={{ ...th, textAlign: "right" }}>Транзакции</th>
                <th style={th}>Создан</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(u => (
                <tr
                  key={u.id}
                  onClick={() => setSelected(u)}
                  style={{
                    borderTop: "1px solid #ece6d8",
                    background: selected?.id === u.id ? "#fdf2f4" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <td style={td}>
                    {u.email}
                    {u.is_admin && <span style={adminBadge}>ADMIN</span>}
                  </td>
                  <td style={td}>{u.username}</td>
                  <td style={td}>
                    <PlanBadge plan={u.plan} />
                  </td>
                  <td style={{ ...td, color: u.is_active ? "#167a4a" : "#c0432b" }}>
                    {u.is_active ? "активен" : "заблокирован"}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{u.accounts_count}</td>
                  <td style={{ ...td, textAlign: "right" }}>{u.categories_count}</td>
                  <td style={{ ...td, textAlign: "right" }}>{u.transactions_count}</td>
                  <td style={{ ...td, color: "#a6afb8", fontSize: 12 }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("ru-RU") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sidebar */}
      {selected && (
        <UserDetail
          user={selected}
          adminId={adminId}
          onClose={() => setSelected(null)}
          onChanged={onUserChanged}
        />
      )}
    </div>
  );
}
