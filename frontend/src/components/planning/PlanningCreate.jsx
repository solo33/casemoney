import CategoryPicker from "../CategoryPicker";

export default function PlanningCreate({ form, currencies, accounts, categories, change, save, saving, openTemplateModal, openRecurringModal, templateMode = false }) {
  return <section className="planning-create-card"><h2>{templateMode ? "Создать шаблон" : "Новая операция"}</h2><p>{templateMode ? "Заполните сумму, счёт и категорию. Затем дайте шаблону название. Дату вы выберете при использовании шаблона; сейчас операция не создаётся." : "Запланируйте разовую операцию или настройте повторение. Плановая запись не меняет остаток до подтверждения."}</p>
    <form className="planning-form" onSubmit={templateMode ? event => { event.preventDefault(); openTemplateModal(); } : save}>
      <label>Тип<select value={form.type} onChange={event => { change("type", event.target.value); change("category_id", ""); }}><option value="expense">Расход</option><option value="income">Доход</option></select></label>
      <label>Сумма<input type="number" min="0.01" step="0.01" required inputMode="decimal" value={form.amount} placeholder="0,00" onChange={event => change("amount", event.target.value)} /></label>
      <label>Валюта<select value={form.currency} onChange={event => change("currency", event.target.value)}>{[...new Set([form.currency, ...currencies])].map(currency => <option key={currency}>{currency}</option>)}</select></label>
      <label>Счёт<select required value={form.account_id} onChange={event => change("account_id", event.target.value)}><option value="">Выберите счёт</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <div><span>Категория</span><CategoryPicker showParent categories={categories.filter(item => item.type === form.type)} value={form.category_id} onChange={value => change("category_id", value)} /></div>
      {!templateMode && <label>Дата<input type="date" required value={form.date} onChange={event => change("date", event.target.value)} /></label>}
      <label className="planning-description">Комментарий<input value={form.description} placeholder="Например: оплата интернета" onChange={event => change("description", event.target.value)} /></label>
      <button type="submit" disabled={saving}>{saving ? "Сохраняем…" : templateMode ? "Сохранить шаблон" : "Запланировать"}</button>
      {!templateMode && <><button type="button" className="btn-secondary" onClick={event => { if (event.currentTarget.form.reportValidity()) openRecurringModal(); }}>Настроить повторение</button>
      <button type="button" className="btn-ghost" onClick={event => { if (event.currentTarget.form.reportValidity()) openTemplateModal(); }}>Сохранить шаблон</button></>}
    </form>
  </section>;
}
