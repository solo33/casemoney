

export function TypeBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "5px 14px", borderRadius: 999,
        border: `1px solid ${active ? "#173a54" : "#e4ddcd"}`,
        background: active ? "#173a54" : "transparent",
        color: active ? "#fff" : "#515c68",
        fontSize: 13, fontWeight: active ? 600 : 500, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function FilterChips({ label, items, selected, onToggle, onClear }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "#7a8590", fontWeight: 600, paddingTop: 4, minWidth: 78 }}>
        {label}:
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
        <Chip active={selected.size === 0} onClick={onClear}>Все</Chip>
        {items.map(it => (
          <Chip key={it.id} active={selected.has(it.id)} onClick={() => onToggle(it.id)}>
            {it.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "3px 10px", borderRadius: 999, fontSize: 12,
        border: `1px solid ${active ? "#9c7b3c" : "#e4ddcd"}`,
        background: active ? "#9c7b3c" : "transparent",
        color: active ? "#fff" : "#515c68",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
