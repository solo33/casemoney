import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { formatMoney } from "../utils/money";

const blankUpload = () => ({
  file: null,
  merchant: "",
  receipt_date: new Date().toISOString().slice(0, 10),
  total_amount: "",
  currency: "RUB",
  transaction_id: "",
  note: "",
});
const blankLine = { name: "", quantity: "1", unit_price: "", total_amount: "", category_id: "" };

export default function ReceiptSection({ categories, accounts }) {
  const [receipts, setReceipts] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [upload, setUpload] = useState(blankUpload);
  const [line, setLine] = useState(blankLine);
  const [selectedId, setSelectedId] = useState(null);
  const [expenseReceipt, setExpenseReceipt] = useState(null);
  const [newExpense, setNewExpense] = useState({ amount: "", account_id: "", category_id: "", date: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [receiptsResponse, transactionsResponse] = await Promise.all([
      api.get("/api/receipts"),
      api.get("/api/transactions/", { params: { type: "expense", limit: 100 } }),
    ]);
    setReceipts(receiptsResponse.data);
    setExpenses(transactionsResponse.data.items || []);
  }, []);

  useEffect(() => { load().catch(() => setError("Не удалось загрузить чеки")); }, [load]);

  const selected = useMemo(() => receipts.find(receipt => receipt.id === selectedId) || null, [receipts, selectedId]);
  const setUploadField = (field, value) => setUpload(current => ({ ...current, [field]: value }));

  const uploadReceipt = async event => {
    event.preventDefault();
    if (!upload.file) { setError("Выберите фото или PDF чека"); return; }
    setBusy(true); setError("");
    try {
      const body = new FormData();
      body.append("file", upload.file);
      ["merchant", "receipt_date", "total_amount", "currency", "note", "transaction_id"].forEach(key => {
        if (upload[key] !== "" && upload[key] != null) body.append(key, upload[key]);
      });
      const response = await api.post("/api/receipts/upload", body);
      setReceipts(current => [response.data, ...current]);
      setSelectedId(response.data.id);
      setUpload(blankUpload());
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось сохранить чек");
    } finally { setBusy(false); }
  };

  const openFile = async receipt => {
    try {
      const response = await api.get(`/api/receipts/${receipt.id}/file`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { setError("Не удалось открыть файл чека"); }
  };

  const deleteReceipt = async receipt => {
    if (!window.confirm(`Удалить чек «${receipt.original_filename}»?`)) return;
    try {
      await api.delete(`/api/receipts/${receipt.id}`);
      setReceipts(current => current.filter(item => item.id !== receipt.id));
      if (selectedId === receipt.id) setSelectedId(null);
    } catch { setError("Не удалось удалить чек"); }
  };

  const addLine = async event => {
    event.preventDefault();
    if (!selected || !line.name.trim()) return;
    try {
      const response = await api.post(`/api/receipts/${selected.id}/items`, {
        name: line.name.trim(),
        quantity: line.quantity === "" ? null : Number(line.quantity),
        unit_price: line.unit_price === "" ? null : Number(line.unit_price),
        total_amount: line.total_amount === "" ? null : Number(line.total_amount),
        category_id: line.category_id || null,
      });
      setReceipts(current => current.map(item => item.id === selected.id ? { ...item, items: [...item.items, response.data] } : item));
      setLine(blankLine);
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось добавить позицию"); }
  };

  const deleteLine = async item => {
    if (!selected) return;
    try {
      await api.delete(`/api/receipts/${selected.id}/items/${item.id}`);
      setReceipts(current => current.map(receipt => receipt.id === selected.id ? { ...receipt, items: receipt.items.filter(row => row.id !== item.id) } : receipt));
    } catch { setError("Не удалось удалить позицию чека"); }
  };

  const openExpense = receipt => {
    setExpenseReceipt(receipt);
    setNewExpense({ amount: receipt.total_amount ?? "", account_id: "", category_id: "", date: receipt.receipt_date || new Date().toISOString().slice(0, 10) });
  };

  const createExpense = async event => {
    event.preventDefault();
    if (!expenseReceipt || !newExpense.amount || !newExpense.account_id) return;
    try {
      const response = await api.post("/api/transactions/", {
        type: "expense", amount: Number(newExpense.amount), currency: expenseReceipt.currency,
        account_id: Number(newExpense.account_id), category_id: newExpense.category_id ? Number(newExpense.category_id) : null,
        description: expenseReceipt.merchant || "Расход по чеку", date: `${newExpense.date}T12:00:00`,
      });
      const updated = await api.patch(`/api/receipts/${expenseReceipt.id}`, { transaction_id: response.data.id });
      setReceipts(current => current.map(item => item.id === updated.data.id ? updated.data : item));
      setExpenses(current => [response.data, ...current]);
      setExpenseReceipt(null);
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось создать расход"); }
  };

  return <section className="receipts-card">
    <div className="receipts-heading"><div><h2>Чеки</h2><p>Прикрепите фото или PDF, затем внесите товары вручную и свяжите чек с расходом.</p></div></div>
    {error && <div className="form-error">{error}</div>}
    <form className="receipt-upload-form" onSubmit={uploadReceipt}>
      <label className="receipt-file-label">Фото или PDF<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" onChange={e => setUploadField("file", e.target.files?.[0] || null)} required /></label>
      <input value={upload.merchant} placeholder="Магазин" onChange={e => setUploadField("merchant", e.target.value)} />
      <input type="date" value={upload.receipt_date} onChange={e => setUploadField("receipt_date", e.target.value)} />
      <input inputMode="decimal" value={upload.total_amount} placeholder="Сумма" onChange={e => setUploadField("total_amount", e.target.value)} />
      <select value={upload.currency} onChange={e => setUploadField("currency", e.target.value)}><option>RUB</option><option>USD</option><option>EUR</option><option>UAH</option></select>
      <select value={upload.transaction_id} onChange={e => setUploadField("transaction_id", e.target.value)}><option value="">Привязать позднее</option>{expenses.map(item => <option key={item.id} value={item.id}>{item.description || "Расход"} · {formatMoney(item.amount)} {item.currency}</option>)}</select>
      <button type="submit" disabled={busy}>{busy ? "Сохраняем…" : "Добавить чек"}</button>
    </form>
    <div className="receipt-layout">
      <div className="receipt-list">
        {receipts.length === 0 && <p className="empty-state">Чеков пока нет.</p>}
        {receipts.map(receipt => <article className={`receipt-row ${receipt.id === selectedId ? "is-selected" : ""}`} key={receipt.id}>
          <button className="receipt-row-main" type="button" onClick={() => setSelectedId(receipt.id)}><strong>{receipt.merchant || receipt.original_filename}</strong><span>{receipt.receipt_date || "Дата не указана"}{receipt.total_amount != null ? ` · ${formatMoney(receipt.total_amount)} ${receipt.currency}` : ""}</span><small>{receipt.transaction_id ? "Расход привязан" : "Расход не привязан"}</small></button>
          <div className="receipt-row-actions"><button type="button" className="btn-secondary" onClick={() => openFile(receipt)}>Файл</button>{!receipt.transaction_id && <button type="button" className="btn-secondary" onClick={() => openExpense(receipt)}>Учесть</button>}<button type="button" className="btn-icon-danger" onClick={() => deleteReceipt(receipt)} aria-label="Удалить чек">×</button></div>
        </article>)}
      </div>
      {selected && <div className="receipt-editor"><div className="receipt-editor-heading"><div><h3>{selected.merchant || "Позиции чека"}</h3><span>{selected.original_filename}</span></div><button type="button" className="btn-ghost" onClick={() => setSelectedId(null)}>×</button></div>
        <div className="receipt-lines">{selected.items.length === 0 && <p className="empty-state">Добавьте товары вручную.</p>}{selected.items.map(item => <div key={item.id}><span>{item.name}</span><small>{item.quantity ? `${item.quantity} × ` : ""}{item.unit_price != null ? `${formatMoney(item.unit_price)} · ` : ""}{item.total_amount != null ? formatMoney(item.total_amount) : ""}</small><button type="button" className="btn-icon-danger" onClick={() => deleteLine(item)} aria-label={`Удалить ${item.name}`}>×</button></div>)}</div>
        <form className="receipt-line-form" onSubmit={addLine}><input value={line.name} placeholder="Товар" onChange={e => setLine(current => ({ ...current, name: e.target.value }))} required /><input inputMode="decimal" value={line.quantity} placeholder="Кол-во" onChange={e => setLine(current => ({ ...current, quantity: e.target.value }))} /><input inputMode="decimal" value={line.unit_price} placeholder="Цена" onChange={e => setLine(current => ({ ...current, unit_price: e.target.value }))} /><input inputMode="decimal" value={line.total_amount} placeholder="Сумма" onChange={e => setLine(current => ({ ...current, total_amount: e.target.value }))} /><select value={line.category_id} onChange={e => setLine(current => ({ ...current, category_id: e.target.value }))}><option value="">Категория</option>{categories.map(category => <option key={category.id} value={category.id}>{category.parent_id ? "↳ " : ""}{category.name}</option>)}</select><button type="submit">Добавить товар</button></form>
      </div>}
    </div>
    {expenseReceipt && <div className="modal-backdrop"><form className="shopping-expense-modal" onSubmit={createExpense}><div className="modal-heading"><h2>Учесть чек как расход</h2><button type="button" className="btn-ghost" onClick={() => setExpenseReceipt(null)}>×</button></div><p>{expenseReceipt.merchant || expenseReceipt.original_filename}</p><label>Сумма<input autoFocus inputMode="decimal" value={newExpense.amount} onChange={e => setNewExpense(current => ({ ...current, amount: e.target.value }))} required /></label><label>Счёт<select value={newExpense.account_id} onChange={e => setNewExpense(current => ({ ...current, account_id: e.target.value }))} required><option value="">Выберите счёт</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Категория<select value={newExpense.category_id} onChange={e => setNewExpense(current => ({ ...current, category_id: e.target.value }))}><option value="">Без категории</option>{categories.map(category => <option key={category.id} value={category.id}>{category.parent_id ? "↳ " : ""}{category.name}</option>)}</select></label><label>Дата<input type="date" value={newExpense.date} onChange={e => setNewExpense(current => ({ ...current, date: e.target.value }))} /></label><button type="submit">Создать расход и привязать чек</button></form></div>}
  </section>;
}
