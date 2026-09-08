import { currencySymbol, formatMoney, COMMON_CURRENCIES } from "../../utils/money";
import api from "../../api/client";

import { lbl } from "../../utils/goalsView";

export function GoalCard({ g, onEdit, onDelete, onArchive, onRestore, archived = false }) {
  const sym = currencySymbol(g.currency);
  const pct = g.progress_percent;
  const reached = pct >= 100;
  const addContribution = async () => {
    const raw = window.prompt("Сумма взноса", "");
    if (!raw) return;
    try { await api.post(`/api/goals/${g.id}/contributions`, { amount: Number(raw.replace(",", ".")) }); window.location.reload(); }
    catch { window.alert("Не удалось добавить взнос."); }
  };
  return (
    <div style={{
      background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
      padding: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 24 }}>{g.icon || "🎯"}</span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "var(--serif)", fontSize: 18, fontWeight: 600,
            color: "#1b2531",
          }}>
            {g.name}
            {g.is_shared && <span style={{ marginLeft: 8, fontSize: 12, color: "#a06b18" }}>Общая цель</span>}
          </div>
          {g.account_name && (
            <div style={{ fontSize: 12, color: "#a6afb8" }}>
              привязано к счёту: {g.account_name}
            </div>
          )}
          {g.due_date && (
            <div style={{ fontSize: 12, color: "#a6afb8" }}>
              до {new Date(g.due_date).toLocaleDateString("ru-RU")}
            </div>
          )}
          {g.monthly_contribution != null && (
            <div style={{ fontSize: 12, color: "#a06b18" }}>
              нужно откладывать {formatMoney(g.monthly_contribution)} {sym} в месяц
              {g.weekly_contribution != null && ` · ${formatMoney(g.weekly_contribution)} ${sym} в неделю`}
            </div>
          )}
          {g.forecast_date && (
            <div style={{ fontSize: 12, color: g.schedule_deviation_days > 0 ? "#c0432b" : "#167a4a" }}>
              при текущем темпе — {new Date(g.forecast_date).toLocaleDateString("ru-RU")}
              {g.schedule_deviation_days != null && (
                g.schedule_deviation_days > 0
                  ? `, позже срока на ${g.schedule_deviation_days} дн.`
                  : g.schedule_deviation_days < 0
                    ? `, раньше срока на ${Math.abs(g.schedule_deviation_days)} дн.`
                    : ", в срок"
              )}
            </div>
          )}
        </div>
        {archived ? (
          <button className="btn-ghost" onClick={onRestore} style={{ padding: "4px 10px", fontSize: 13 }}>Вернуть</button>
        ) : <>
          <button className="btn-ghost" onClick={onEdit} style={{ padding: "4px 10px", fontSize: 13 }}>
            ✎
          </button>
          <button className="btn-ghost" onClick={onArchive} style={{ padding: "4px 10px", fontSize: 13 }}>
            Архив
          </button>
        </>}
        <button className="btn-ghost" onClick={onDelete}
          style={{ padding: "4px 10px", fontSize: 13, color: "#c0432b" }}>
          ×
        </button>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 12, background: "#efe9db", borderRadius: 6, overflow: "hidden",
        marginBottom: 8,
      }}>
        <div style={{
          width: `${Math.min(100, pct)}%`,
          height: "100%",
          background: reached
            ? "linear-gradient(90deg, #167a4a 0%, #4ade80 100%)"
            : "linear-gradient(90deg, #173a54 0%, #be123c 100%)",
          transition: "width 0.4s",
        }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: reached ? "#167a4a" : "#1b2531", fontWeight: 600, fontSize: 14 }}>
          {formatMoney(g.current_amount)} {sym}
        </span>
        <span style={{ color: "#a6afb8", fontSize: 13 }}>
          из {formatMoney(g.target_amount)} {sym} · осталось {formatMoney(g.remaining_amount)} {sym}
        </span>
        <span style={{
          color: reached ? "#167a4a" : "#173a54",
          fontWeight: 600, fontSize: 14, minWidth: 50, textAlign: "right",
        }}>
          {reached ? "✓ 100%" : `${pct}%`}
        </span>
      </div>
      {!archived && g.priority_allocation_amount != null && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#515c68" }}>
          По порядку целей доступно: <strong>{formatMoney(g.priority_allocation_amount)} {sym}</strong>
          {g.priority_shortfall_amount > 0 && <> · не хватает {formatMoney(g.priority_shortfall_amount)} {sym}</>}
          {g.priority_shortfall_amount === 0 && <> · цель полностью покрыта</>}
        </div>
      )}
      {g.is_shared && <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><button type="button" className="btn-secondary" onClick={addContribution}>+ Мой взнос</button><span style={{ fontSize: 12, color: "#a6afb8" }}>Взносы: {formatMoney(g.contributions_total)} {sym}</span>{g.contributions.map(item => <span key={item.id} style={{ fontSize: 12, color: "#515c68" }}>{item.name}: {formatMoney(item.amount)} {sym}</span>)}</div>}
    </div>
  );
}

export function GoalForm({ form, setForm, accounts, onSubmit, onCancel, isEdit }) {
  const hasAccount = !!form.account_id;
  return (
    <form onSubmit={onSubmit} style={{
      background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
      padding: 18, marginBottom: 16,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <h3 style={{ margin: 0 }}>{isEdit ? "Редактировать цель" : "Новая цель"}</h3>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={form.icon}
          onChange={e => setForm({ ...form, icon: e.target.value })}
          placeholder="🎯"
          style={{ width: 60, textAlign: "center", fontSize: 18 }}
        />
        <input
          placeholder="Название (например, Резервный фонд)"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          required
          style={{ flex: 1, minWidth: 220 }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={lbl}>Целевая сумма</label>
        <input
          type="number" step="0.01" min="0.01"
          value={form.target_amount}
          onChange={e => setForm({ ...form, target_amount: e.target.value })}
          required
          style={{ width: 160, textAlign: "right", fontSize: 16, fontWeight: 600 }}
        />
        <select
          value={form.currency}
          onChange={e => setForm({ ...form, currency: e.target.value })}
          style={{ width: 100 }}
        >
          {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={lbl}>Прогресс</label>
        <select
          value={form.account_id}
          onChange={e => setForm({ ...form, account_id: e.target.value })}
          style={{ minWidth: 200 }}
        >
          <option value="">— вручную —</option>
          {accounts.map(a => <option key={a.id} value={a.id}>📈 Баланс «{a.name}»</option>)}
        </select>
        {!hasAccount && (
          <>
            <span style={lbl}>Текущая сумма</span>
            <input
              type="number" step="0.01"
              value={form.current_amount}
              onChange={e => setForm({ ...form, current_amount: e.target.value })}
              style={{ width: 140, textAlign: "right" }}
            />
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={lbl}>Срок (необязательно)</label>
        <input
          type="date"
          value={form.due_date}
          onChange={e => setForm({ ...form, due_date: e.target.value })}
        />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={lbl}>Приоритет</label>
        <input type="number" min="0" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} style={{ width: 90 }} />
        <span style={{ fontSize: 12, color: "#a6afb8" }}>Меньшее число — выше в списке и в распределении средств.</span>
      </div>

      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={form.is_shared} onChange={e => setForm({ ...form, is_shared: e.target.checked })} /> Общая цель семьи</label>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Отмена</button>
        <button type="submit">{isEdit ? "Сохранить" : "Создать"}</button>
      </div>
    </form>
  );
}
