

export function PeriodCard({ active, title, price, text, onClick }) {
  return <button type="button" className={`period-card ${active ? "active" : ""}`} onClick={onClick}><span>{title}</span><strong>{price}</strong><small>{text}</small></button>;
}
