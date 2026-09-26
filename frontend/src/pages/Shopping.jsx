import "../styles/shopping.css";
import { useUser } from "../contexts/UserContext";
import useShoppingController from "../hooks/useShoppingController";
import { ShoppingRow } from "../components/shopping/ShoppingParts";

export default function Shopping() {
  const { user } = useUser();
  const { lists, listId, setListId, history, form, newList, setNewList, shareNewList, setShareNewList, error, loading, planned, bought, updateForm, applySuggestion, addItem, createList, markBought, reopen, removeItem, selectedList, shareList, sharing } = useShoppingController();
  if (loading) return <div className="page">Загружаем список покупок…</div>;
  return <div className="page shopping-page">
    <div className="page-heading"><div><h1>Список покупок</h1><p>Добавляйте товары и отмечайте покупки вместе с семьёй.</p></div></div>
    {error && <div className="form-error">{error}</div>}
    <section className="shopping-toolbar">
      <label>Список<select value={listId} onChange={e => setListId(e.target.value)}>{lists.map(list => <option key={list.id} value={list.id}>{list.name}{list.is_shared ? " · Семейный" : ""}{list.is_default ? " — основной" : ""}</option>)}</select></label>
      {selectedList && <div className="shopping-sharing">
        {selectedList.user_id === user?.id ? <label className="shopping-share"><input type="checkbox" checked={Boolean(selectedList.is_shared)} disabled={sharing} onChange={event => shareList(event.target.checked)} /> Доступен семье</label> : <strong>{selectedList.is_shared ? "Семейный список" : "Личный список"}</strong>}
        <small>{selectedList.is_shared ? "Участники семьи могут добавлять, отмечать и удалять товары. Изменения обновляются автоматически." : "Включите семейный доступ, чтобы покупать вместе. Участников можно пригласить в разделе «Семья»."}</small>
      </div>}
      <details className="shopping-list-create"><summary>+ Новый список</summary><form onSubmit={createList} className="shopping-new-list"><label>Название списка<input required value={newList} placeholder="Например, дача" onChange={e => setNewList(e.target.value)} /></label><label className="shopping-share"><input type="checkbox" checked={shareNewList} onChange={e => setShareNewList(e.target.checked)} /> Семейный</label><button type="submit" className="btn-secondary">Создать список</button></form></details>
    </section>
    <section className="shopping-add-card">
      <h2>Добавить товар</h2>
      <form className="shopping-add-form" onSubmit={addItem}>
        <label className="shopping-product-field">Товар<input required aria-label="Товар" list="shopping-history" autoComplete="off" enterKeyHint="done" value={form.name} placeholder="Например: молоко; 2 шт" onChange={e => updateForm("name", e.target.value)} /></label>
        <datalist id="shopping-history">{history.map((item, index) => <option key={`${item.name}-${index}`} value={item.name} />)}</datalist>
        <button type="submit" disabled={!listId}>Добавить</button>
        <details className="shopping-item-details"><summary>Количество и единица</summary><div>
          <label>Количество<input type="number" min="0.01" step="any" required inputMode="decimal" value={form.quantity} onChange={e => updateForm("quantity", e.target.value)} /></label>
          <label>Единица<input value={form.unit} aria-label="Единица измерения" placeholder="шт., кг, л" onChange={e => updateForm("unit", e.target.value)} /></label>
        </div></details>
      </form>
      {history.length > 0 && <div className="shopping-suggestions"><span>Из прошлых покупок:</span>{history.slice(0, 8).map((item, index) => <button type="button" key={`${item.name}-${index}`} onClick={() => applySuggestion(item)}>{item.name}</button>)}</div>}
    </section>
    <section className="shopping-items-card">
      <h2>Купить ({planned.length})</h2>
      {planned.length === 0 ? <p className="empty-state">Список пуст. Добавьте первую покупку выше.</p> : planned.map(item => <ShoppingRow key={item.id} item={item} onBought={() => markBought(item)} onDelete={() => removeItem(item)} />)}
    </section>
    {bought.length > 0 && <section className="shopping-items-card shopping-bought"><h2>Куплено ({bought.length})</h2>{bought.map(item => <ShoppingRow key={item.id} item={item} bought onReopen={() => reopen(item)} onDelete={() => removeItem(item)} />)}</section>}
  </div>;
}
