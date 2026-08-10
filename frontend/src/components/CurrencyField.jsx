export default function CurrencyField({ currencies, value, onChange, fallback = [] }) {
  const options = currencies.length ? currencies : fallback;
  if (options.length <= 1) {
    return <span className="single-currency" aria-label={`Валюта ${value || options[0] || ""}`}>{value || options[0] || "—"}</span>;
  }
  return (
    <select value={value} onChange={onChange} className="currency-choice">
      {options.map(currency => <option key={currency} value={currency}>{currency}</option>)}
    </select>
  );
}
