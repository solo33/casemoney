

export const blankItem = { name: "", quantity: "1", unit: "", planned_price: "", currency: "RUB", category_id: "", note: "" };

export function parseShoppingEntry(value) {
  const separator = value.indexOf(";");
  if (separator < 0) return { name: value.trim() };

  const name = value.slice(0, separator).trim();
  const details = value.slice(separator + 1).trim();
  const match = details.match(/^(\d+(?:[,.]\d+)?)\s*(.*)$/u);
  if (!name || !match) return { name: value.trim() };

  return {
    name,
    quantity: Number(match[1].replace(",", ".")),
    unit: match[2].trim(),
  };
}
