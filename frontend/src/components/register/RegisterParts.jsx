

export function ModeOption({ active, title, text, onClick }) {
  return <button type="button" onClick={onClick} style={{
    textAlign: "left", padding: 12, borderRadius: 9, cursor: "pointer",
    border: `1px solid ${active ? "#173a54" : "#e4ddcd"}`,
    background: active ? "#eef4f7" : "#fffdf7", color: "#1b2531",
  }}><strong style={{ display: "block", marginBottom: 4 }}>{title}</strong><span style={{ fontSize: 12, color: "#687582" }}>{text}</span></button>;
}
