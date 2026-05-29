import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { useUser } from "../contexts/UserContext";
import { currencySymbol, formatMoney, formatMoneyWithCurrency } from "../utils/money";

const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" };
const TYPE_COLOR = { income: "#22c55e", expense: "#ef4444", transfer: "#3b82f6" };

function formatDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export default function Home() {
  const { mainCurrency } = useUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(() => {
    api.get("/api/dashboard/")
      .then(res => setData(res.data))
      .catch(() => setError("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    window.addEventListener(TX_ADDED_EVENT, fetchData);
    return () => window.removeEventListener(TX_ADDED_EVENT, fetchData);
  }, [fetchData]);

  // Перезагружаем при смене основной валюты
  useEffect(() => { fetchData(); }, [mainCurrency, fetchData]);

  if (loading) return <div className="page">Загрузка...</div>;
  if (error) return <div className="page" style={{ color: "#ef4444" }}>{error}</div>;

  const main = data.main_currency || mainCurrency;
  const sym = currencySymbol(main);
  const recent5 = (data.recent_transactions || []).slice(0, 5);
  const monthNet = data.month_income - data.month_expense;
  const now = new Date();
  const monthName = now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  return (
    <div className="page">
      {/* Hero — общий баланс */}
      <div style={{
        background: "linear-gradient(135deg, #818cf8 0%, #4f46e5 100%)",
        borderRadius: 16,
        padding: "24px 28px",
        color: "#fff",
        marginBottom: 20,
        boxShadow: "0 4px 12px rgba(99,102,241,0.25)",
      }}>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>Общий баланс</div>
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.5 }}>
          {formatMoney(data.total_balance)} {sym}
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          в {main} (пересчёт по текущему курсу)
        </div>
      </div>

      {/* Этот месяц */}
      <div style={{ marginBottom: 8, fontSize: 13, color: "#64748b", textTransform: "capitalize" }}>
        {monthName}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
        <div style={{
          flex: 1, minWidth: 140, background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 12, padding: "14px 18px",
        }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Доходы</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#22c55e" }}>
            +{formatMoney(data.month_income)} {sym}
          </div>
        </div>
        <div style={{
          flex: 1, minWidth: 140, background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 12, padding: "14px 18px",
        }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Расходы</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>
            −{formatMoney(data.month_expense)} {sym}
          </div>
        </div>
        <div style={{
          flex: 1, minWidth: 140, background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 12, padding: "14px 18px",
        }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Сальдо</div>
          <div style={{
            fontSize: 20, fontWeight: 700,
            color: monthNet >= 0 ? "#22c55e" : "#ef4444",
          }}>
            {monthNet >= 0 ? "+" : ""}{formatMoney(monthNet)} {sym}
          </div>
        </div>
      </div>

      {/* Счета */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Счета
        </h3>
        <Link to="/accounts" style={{ fontSize: 13, color: "#6366f1", textDecoration: "none" }}>
          Все →
        </Link>
      </div>

      {data.accounts.length === 0 ? (
        <div style={{ background: "#fff", border: "1px dashed #cbd5e1", borderRadius: 12, padding: 20, textAlign: "center", color: "#94a3b8", marginBottom: 28 }}>
          Нет счетов. <Link to="/accounts" style={{ color: "#6366f1" }}>Добавьте первый →</Link>
        </div>
      ) : (
        <div style={{
          display: "flex", gap: 10, marginBottom: 28,
          overflowX: "auto", paddingBottom: 4,
          WebkitOverflowScrolling: "touch",
        }}>
          {data.accounts.map(acc => (
            <div key={acc.id} style={{
              flex: "0 0 auto",
              minWidth: 160,
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "14px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                {acc.icon && <span style={{ fontSize: 18 }}>{acc.icon}</span>}
                <span style={{ fontSize: 13, color: "#64748b" }}>{acc.name}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: acc.color || "#0f172a" }}>
                {formatMoney(acc.total_in_main)} <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>{sym}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Последние транзакции */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Последние операции
        </h3>
        <Link to="/transactions" style={{ fontSize: 13, color: "#6366f1", textDecoration: "none" }}>
          Все →
        </Link>
      </div>

      {recent5.length === 0 ? (
        <div style={{ background: "#fff", border: "1px dashed #cbd5e1", borderRadius: 12, padding: 20, textAlign: "center", color: "#94a3b8" }}>
          Нет транзакций. <Link to="/transactions" style={{ color: "#6366f1" }}>Добавьте первую →</Link>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          {recent5.map((tx, idx) => (
            <div key={tx.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px",
              borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "#f1f5f9", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 18, flexShrink: 0,
              }}>
                {tx.category_icon || "💸"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tx.description || tx.category_name || TYPE_LABEL[tx.type]}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {tx.account_name} · {formatDate(tx.date)}
                </div>
              </div>
              <div style={{
                fontWeight: 600, fontSize: 15,
                color: TYPE_COLOR[tx.type], whiteSpace: "nowrap",
              }}>
                {tx.type === "expense" ? "−" : "+"}{formatMoneyWithCurrency(tx.amount, tx.currency)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
