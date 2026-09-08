

export function TabHead({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "#fffdf7" : "transparent",
        border: "none",
        borderBottom: active ? "2px solid #173a54" : "2px solid transparent",
        color: active ? "#1b2531" : "#7a8590",
        fontWeight: active ? 700 : 500,
        fontSize: 13,
        padding: "12px 16px",
        cursor: "pointer",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        minWidth: 0,
        flex: "0 1 auto",
      }}
    >
      {children}
    </button>
  );
}

export function Card({ children, style, noPadding, className = "", ...props }) {
  return (
    <div className={className} style={{
      background: "#fffdf7",
      border: "1px solid #e4ddcd",
      borderRadius: 10,
      padding: noPadding ? 0 : 16,
      ...style,
    }} {...props}>
      {children}
    </div>
  );
}

export function ToggleBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 12px",
        borderRadius: 999,
        border: `1px solid ${active ? "#173a54" : "#e4ddcd"}`,
        background: active ? "#173a54" : "transparent",
        color: active ? "#fff" : "#515c68",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
