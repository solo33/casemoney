import { useId } from "react";
import AmountInput from "./AmountInput";
import CategoryPicker from "./CategoryPicker";
import "../styles/transfer-fee.css";

export default function TransferFeeFields({ form, setForm, categories }) {
  const fieldsId = useId();
  return <div className="transfer-fee">
    <label className="transfer-fee-toggle">
      <input type="checkbox" checked={Boolean(form.fee_enabled)} aria-controls={fieldsId} aria-expanded={Boolean(form.fee_enabled)} onChange={event => {
        const enabled = event.target.checked;
        setForm(current => ({ ...current, fee_enabled: enabled, ...(enabled ? {} : { fee_amount: "", fee_category_id: "" }) }));
      }} />
      <span>Добавить комиссию</span>
    </label>
    {form.fee_enabled && <div id={fieldsId} className="transfer-fee-fields">
      <div className="transfer-fee-amount">
        <label htmlFor={`${fieldsId}-amount`}>Комиссия{form.currency ? `, ${form.currency}` : ""}</label>
        <AmountInput id={`${fieldsId}-amount`} type="number" inputMode="decimal" min="0.01" step="0.01" required value={form.fee_amount} onChange={event => setForm(current => ({ ...current, fee_amount: event.target.value }))} placeholder="0,00" />
      </div>
      <div className="transfer-fee-category">
        <span>Категория комиссии</span>
        <CategoryPicker categories={categories.filter(category => category.type === "expense")} value={form.fee_category_id} onChange={value => setForm(current => ({ ...current, fee_category_id: value }))} placeholder="Выберите категорию" />
      </div>
    </div>}
  </div>;
}
