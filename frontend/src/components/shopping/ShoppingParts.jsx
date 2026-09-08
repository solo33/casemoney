import { formatMoney } from "../../utils/money";

export function ShoppingRow({ item, bought, onBought, onReopen, onDelete, onExpense }) {
  const price = item.actual_price ?? item.planned_price;
  return <article className={`shopping-item ${bought ? "is-bought" : ""}`}><button type="button" className="shopping-check" onClick={bought ? onReopen : onBought} aria-label={bought ? "Вернуть в список" : "Отметить купленным"}>{bought ? "✓" : ""}</button><div className="shopping-item-name"><strong>{item.name}</strong><span>{item.quantity}{item.unit ? ` ${item.unit}` : ""}{price != null ? ` · ${formatMoney(price)} ${item.currency}` : ""}</span></div><div className="shopping-item-actions">{!item.transaction_id && <button type="button" className="btn-secondary" onClick={onExpense}>Учесть расход</button>}<button type="button" className="btn-icon-danger" onClick={onDelete} aria-label="Удалить">×</button></div></article>;
}
