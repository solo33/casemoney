import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import SettingsTabs from "../components/SettingsTabs";
import { formatMoney } from "../utils/money";

export default function Automation() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [regularPayments, setRegularPayments] = useState([]);
  const [settings, setSettings] = useState({ rules_enabled: true, duplicates_enabled: true });
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rulesResponse, categoriesResponse, duplicatesResponse, settingsResponse, regularResponse] = await Promise.all([
        api.get("/api/automation/rules"),
        api.get("/api/categories/"),
        api.get("/api/automation/duplicates"),
        api.get("/api/automation/settings"),
        api.get("/api/automation/regular-payments"),
      ]);
      setRules(rulesResponse.data || []);
      setCategories(categoriesResponse.data || []);
      setDuplicates(duplicatesResponse.data || []);
      setSettings(settingsResponse.data || { rules_enabled: true, duplicates_enabled: true });
      setRegularPayments(regularResponse.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось загрузить автоматизацию.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const expenseCategories = useMemo(
    () => categories.filter(category => category.type === "expense" && !category.is_hidden),
    [categories],
  );

  const addRule = async event => {
    event.preventDefault();
    if (!pattern.trim() || !categoryId) return;
    setSaving(true);
    try {
      const response = await api.post("/api/automation/rules", { pattern, category_id: Number(categoryId) });
      setRules(current => [...current, response.data].sort((a, b) => a.pattern.localeCompare(b.pattern, "ru")));
      setPattern("");
      setCategoryId("");
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось сохранить правило.");
    } finally { setSaving(false); }
  };

  const removeRule = async rule => {
    if (!window.confirm(`Удалить правило «${rule.pattern}»?`)) return;
    try {
      await api.delete(`/api/automation/rules/${rule.id}`);
      setRules(current => current.filter(item => item.id !== rule.id));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось удалить правило.");
    }
  };

  const changeSetting = async (key, value) => {
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setSaving(true);
    try {
      const response = await api.patch("/api/automation/settings", { [key]: value });
      setSettings(response.data);
      if (key === "duplicates_enabled" && !value) setDuplicates([]);
      setError("");
    } catch (requestError) {
      setSettings(previous);
      setError(requestError.response?.data?.detail || "Не удалось сохранить настройку.");
    } finally { setSaving(false); }
  };

  return <main className="page automation-page">
    <SettingsTabs />
    <header className="page-heading"><div><h1>Автоматизация</h1><p>Правила подставляют категорию только в новую операцию без категории. Прошлые записи не меняются.</p></div></header>
    {error && <div className="form-error">{error}</div>}
    <section className="automation-card automation-settings">
      <h2>Настройки</h2>
      <label><input type="checkbox" checked={settings.rules_enabled} disabled={saving} onChange={event => changeSetting("rules_enabled", event.target.checked)} /><span><b>Подсказывать категорию по правилам</b><small>Правило применяется только к новой записи без выбранной категории.</small></span></label>
      <label><input type="checkbox" checked={settings.duplicates_enabled} disabled={saving} onChange={event => changeSetting("duplicates_enabled", event.target.checked)} /><span><b>Показывать возможные дубли</b><small>Сервис только показывает похожие записи — удаление всегда остаётся ручным.</small></span></label>
    </section>
    <section className="automation-card">
      <h2>Правило категории</h2>
      <p>Например: «Пятёрочка» → «Продукты». Регистр букв не важен.</p>
      <form className="automation-rule-form" onSubmit={addRule}>
        <label><span>Если в комментарии есть</span><input value={pattern} maxLength="160" placeholder="Пятёрочка" onChange={event => setPattern(event.target.value)} /></label>
        <span className="automation-arrow">→</span>
        <label><span>Выбрать категорию</span><select value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">Категория</option>{expenseCategories.map(category => <option key={category.id} value={category.id}>{category.parent_id ? "↳ " : ""}{category.name}</option>)}</select></label>
        <button type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Добавить"}</button>
      </form>
      <div className="automation-rules">
        {rules.length === 0 ? <p className="empty-state">Правил пока нет.</p> : rules.map(rule => <div key={rule.id}><span>«{rule.pattern}»</span><b>→ {rule.category_name}</b><button type="button" className="btn-ghost danger" onClick={() => removeRule(rule)}>Удалить</button></div>)}
      </div>
    </section>
    {settings.duplicates_enabled && <section className="automation-card">
      <div className="automation-card-head"><div><h2>Возможные дубли</h2><p>Операции с одинаковыми счётом, датой, суммой и комментарием за последний год. Ничего не удаляем автоматически.</p></div><button type="button" className="btn-secondary" onClick={load}>Проверить снова</button></div>
      {duplicates.length === 0 ? <p className="empty-state">Потенциальных дублей не найдено.</p> : <div className="automation-duplicates">{duplicates.map(group => <article key={group.key}><strong>Проверьте {group.transactions.length} похожие операции</strong>{group.transactions.map(item => <div key={item.id}><time>{new Date(`${item.date}T12:00:00`).toLocaleDateString("ru-RU")}</time><span>{item.account_name} · {item.description}</span><b>{formatMoney(item.amount)} {item.currency}</b></div>)}</article>)}</div>}
    </section>}
    <section className="automation-card">
      <div className="automation-card-head"><div><h2>Похожие на регулярные операции</h2><p>Подсказки строятся только по трём и более одинаковым операциям с регулярным интервалом. Ничего не создаётся автоматически.</p></div><button type="button" className="btn-secondary" onClick={load}>Обновить</button></div>
      {regularPayments.length === 0 ? <p className="empty-state">Пока не найдено повторяющихся операций.</p> : <div className="automation-regular-list">{regularPayments.map(item => <article key={item.key}>
        <div><strong>{item.description}</strong><span>{item.transaction_type === "expense" ? "Расход" : "Доход"} · {item.account_name}{item.category_name ? ` · ${item.category_name}` : ""}</span><small>{item.cadence} · {item.occurrences} операций · следующее ориентировочно {new Date(`${item.next_date}T12:00:00`).toLocaleDateString("ru-RU")}</small></div>
        <b className={item.transaction_type === "expense" ? "is-expense" : "is-income"}>{formatMoney(item.amount)} {item.currency}</b>
      </article>)}</div>}
    </section>
  </main>;
}
