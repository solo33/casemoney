

export function Summary({ preview }) {
  const { totals, new_accounts, existing_accounts, new_categories, existing_categories, currencies_to_add } = preview;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 12,
    }}>
      <Stat label="Всего строк" value={totals.rows_total} color="#7a8590" />
      <Stat label="К импорту" value={totals.ok} color="#167a4a" />
      {totals.errors > 0 && <Stat label="Ошибок" value={totals.errors} color="#c0432b" />}
      <Stat label="Переводов" value={totals.transfers} color="#2f6296" />
      <Stat label="Доходы" value={`+${totals.income_sum.toLocaleString("ru-RU")}`} color="#167a4a" />
      <Stat label="Расходы" value={`−${totals.expense_sum.toLocaleString("ru-RU")}`} color="#c0432b" />

      <Pills title="Новые счета" items={new_accounts} color="#167a4a" />
      <Pills title="Существующие счета" items={existing_accounts} color="#7a8590" />
      <Pills title="Новые категории" items={new_categories.map(c => c.name)} color="#173a54" />
      <Pills title="Существующие категории" items={existing_categories} color="#7a8590" />
      {currencies_to_add.length > 0 && (
        <Pills title="Новые валюты" items={currencies_to_add} color="#f59e0b" />
      )}
    </div>
  );
}

export function Stat({ label, value, color }) {
  return (
    <div style={{
      background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 8,
      padding: "10px 14px",
    }}>
      <div style={{ fontSize: 11, color: "#7a8590", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

export function Pills({ title, items, color }) {
  if (!items?.length) return null;
  return (
    <div style={{
      background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 8,
      padding: "10px 14px",
    }}>
      <div style={{ fontSize: 11, color: "#7a8590", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        {title} ({items.length})
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {items.slice(0, 12).map((it, i) => (
          <span key={i} style={{
            fontSize: 12, padding: "2px 8px", borderRadius: 4,
            background: color + "1a", color, fontWeight: 500,
          }}>
            {it}
          </span>
        ))}
        {items.length > 12 && (
          <span style={{ fontSize: 12, color: "#a6afb8" }}>+{items.length - 12}</span>
        )}
      </div>
    </div>
  );
}

export function Th({ children, align = "left" }) {
  return (
    <th style={{
      padding: "10px 12px", textAlign: align,
      fontSize: 12, color: "#7a8590", fontWeight: 600,
      background: "#f6f2e9", whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
}

export function Td({ children, align = "left", style = {} }) {
  return (
    <td style={{ padding: "8px 12px", textAlign: align, ...style }}>{children}</td>
  );
}
