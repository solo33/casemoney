import { useState, useEffect } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import api from "../api/client";

const MONTH_NAMES = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

function formatMoney(amount) {
  return amount.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      padding: "20px 24px",
      minWidth: 180,
      flex: 1,
    }}>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || "#0f172a" }}>
        {formatMoney(value)} ₽
      </div>
    </div>
  );
}

const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" };
const TYPE_COLOR = { income: "#22c55e", expense: "#ef4444", transfer: "#3b82f6" };

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/api/dashboard/")
      .then(res => setData(res.data))
      .catch(() => setError("Ошибка загрузки дашборда"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Загрузка...</div>;
  if (error) return <div style={{ padding: 24, color: "red" }}>{error}</div>;

  const monthlyChartData = data.monthly_stats.map(m => ({
    name: MONTH_NAMES[parseInt(m.month.split("-")[1]) - 1],
    Доходы: m.income,
    Расходы: m.expense,
  }));

  const pieData = data.top_categories.map(c => ({
    name: `${c.category_icon ? c.category_icon + " " : ""}${c.category_name}`,
    value: c.total,
    color: c.category_color,
  }));

  return (
    <div style={{ padding: "0 24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 20 }}>Дашборд</h2>

      {/* Карточки */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <StatCard label="Общий баланс" value={data.total_balance} color="#6366f1" />
        <StatCard label="Доходы за месяц" value={data.month_income} color="#22c55e" />
        <StatCard label="Расходы за месяц" value={data.month_expense} color="#ef4444" />
      </div>

      {/* Графики */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 32 }}>

        {/* Bar chart — доходы/расходы по месяцам */}
        <div style={{ flex: 2, minWidth: 320, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 15, color: "#334155" }}>Доходы и расходы по месяцам</h3>
          {monthlyChartData.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>Нет данных</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChartData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatMoney(v) + " ₽"} />
                <Legend />
                <Bar dataKey="Доходы" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Расходы" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie chart — топ категорий */}
        <div style={{ flex: 1, minWidth: 260, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 15, color: "#334155" }}>Расходы по категориям</h3>
          {pieData.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>Нет данных</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatMoney(v) + " ₽"} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Счета */}
      {data.accounts.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: 15, color: "#334155" }}>Счета</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {data.accounts.map(acc => (
              <div key={acc.id} style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 160,
              }}>
                {acc.icon && <span style={{ fontSize: 20 }}>{acc.icon}</span>}
                <div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>{acc.name}</div>
                  <div style={{ fontWeight: 600, color: acc.color || "#0f172a" }}>
                    {formatMoney(acc.balance)} {acc.currency}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Последние транзакции */}
      {data.recent_transactions.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
          <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: 15, color: "#334155" }}>Последние транзакции</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {data.recent_transactions.map(tx => (
                <tr key={tx.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px 0", width: 32, fontSize: 18 }}>
                    {tx.category_icon || "💸"}
                  </td>
                  <td style={{ padding: "8px 4px" }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>
                      {tx.description || tx.category_name || TYPE_LABEL[tx.type]}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{tx.account_name}</div>
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600, color: TYPE_COLOR[tx.type] }}>
                    {tx.type === "expense" ? "−" : "+"}{formatMoney(tx.amount)} ₽
                  </td>
                  <td style={{ padding: "8px 0 8px 12px", textAlign: "right", fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
                    {new Date(tx.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
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
