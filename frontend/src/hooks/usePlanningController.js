import { useState, useCallback, useEffect, useMemo } from "react";
import api from "../api/client";
import { blankForm, isoDate, today } from "../utils/planningView";

export default function usePlanningController() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [obligations, setObligations] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarUrl, setCalendarUrl] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recurringRuns, setRecurringRuns] = useState(null);

  const loadCalendarEvents = useCallback(async () => {
    const response = await api.get("/api/calendar/events", { params: { days: 730 } });
    setCalendarEvents(response.data || []);
  }, []);

  const load = useCallback(async () => {
    try {
      const [transactionsResponse, accountsResponse, categoriesResponse, templatesResponse, recurringResponse, calendarResponse, eventsResponse, obligationsResponse] = await Promise.all([
        api.get("/api/transactions/", { params: { is_planned: true, limit: 500 } }),
        api.get("/api/accounts/"), api.get("/api/categories/"), api.get("/api/transaction-templates/"),
        api.get("/api/recurring-transactions/"),
        api.get("/api/calendar/subscription"),
        api.get("/api/calendar/events", { params: { days: 730 } }),
        api.get("/api/credits/"),
      ]);
      setTransactions(transactionsResponse.data.items || []);
      setAccounts(accountsResponse.data || []);
      setCategories(categoriesResponse.data || []);
      setTemplates(templatesResponse.data || []);
      setRecurring(recurringResponse.data || []);
      setObligations(obligationsResponse.data || []);
      setCalendarUrl(calendarResponse.data?.url || "");
      setCalendarEvents(eventsResponse.data || []);
      setForm(current => current.account_id ? current : { ...current, account_id: String(accountsResponse.data?.[0]?.id || "") });
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось загрузить планирование."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const currencies = useMemo(() => [...new Set(accounts.flatMap(account => (account.balances || []).map(balance => balance.currency)))].sort(), [accounts]);
  const calendarEntries = useMemo(() => calendarEvents.map(item => ({ ...item, date: isoDate(item.date) })), [calendarEvents]);
  const change = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const save = async event => {
    event.preventDefault();
    if (!form.amount || !form.account_id) return;
    setSaving(true);
    try {
      const response = await api.post("/api/transactions/", {
        type: form.type, amount: Number(form.amount), currency: form.currency,
        account_id: Number(form.account_id), category_id: form.category_id ? Number(form.category_id) : null,
        description: form.description || null, date: `${form.date}T12:00:00`, is_planned: true,
      });
      setTransactions(current => [response.data, ...current]);
      loadCalendarEvents().catch(() => {});
      setForm(current => ({ ...blankForm(), account_id: current.account_id, currency: current.currency }));
      setError("");
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось сохранить плановую запись."); }
    finally { setSaving(false); }
  };
  const makeActual = async transaction => {
    try {
      await api.patch(`/api/transactions/${transaction.id}`, { is_planned: false });
      setTransactions(current => current.filter(item => item.id !== transaction.id));
      loadCalendarEvents().catch(() => {});
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось учесть операцию."); }
  };
  const remove = async transaction => {
    if (!window.confirm(`Удалить плановую запись «${transaction.description || "без названия"}»?`)) return;
    try { await api.delete(`/api/transactions/${transaction.id}`); setTransactions(current => current.filter(item => item.id !== transaction.id)); loadCalendarEvents().catch(() => {}); }
    catch { setError("Не удалось удалить плановую запись."); }
  };
  const [modal, setModal] = useState(null); // { mode: "template" | "recurring" }
  const defaultName = () => form.description || (form.type === "income" ? "Регулярный доход" : "Регулярный расход");

  const openTemplateModal = () => {
    if (!form.amount || !form.account_id) { setError("Сначала заполните операцию, которую нужно сохранить как шаблон."); return; }
    setError("");
    setModal({ mode: "template", name: defaultName() });
  };
  const submitTemplate = async name => {
    try {
      const response = await api.post("/api/transaction-templates/", { ...form, name, amount: Number(form.amount), account_id: Number(form.account_id), category_id: form.category_id ? Number(form.category_id) : null });
      setTemplates(current => [...current, response.data].sort((a, b) => a.name.localeCompare(b.name, "ru")));
      setModal(null);
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось сохранить шаблон."); }
  };
  const applyTemplate = template => setForm({ type: template.type, amount: String(template.amount), currency: template.currency, account_id: String(template.account_id || ""), category_id: String(template.category_id || ""), description: template.description || "", date: today() });
  const removeTemplate = async template => {
    if (!window.confirm(`Удалить шаблон «${template.name}»?`)) return;
    try { await api.delete(`/api/transaction-templates/${template.id}`); setTemplates(current => current.filter(item => item.id !== template.id)); }
    catch { setError("Не удалось удалить шаблон."); }
  };
  const openRecurringModal = () => {
    if (!form.amount || !form.account_id) { setError("Сначала заполните операцию, которую нужно повторять."); return; }
    setError("");
    setModal({ mode: "recurring", name: defaultName(), frequency: "monthly", next_date: form.date, custom_interval_days: 30, execution_mode: "planned", reminder_days: 0, end_date: "" });
  };
  const submitRecurring = async ({ name, frequency, next_date, custom_interval_days, execution_mode, reminder_days, end_date }) => {
    try {
      const response = await api.post("/api/recurring-transactions/", {
        name, type: form.type, amount: Number(form.amount), currency: form.currency,
        account_id: Number(form.account_id), category_id: form.category_id ? Number(form.category_id) : null,
        description: form.description || null, frequency, next_date,
        custom_interval_days: frequency === "custom" ? Number(custom_interval_days) : null,
        execution_mode, reminder_days: Number(reminder_days || 0), end_date: end_date || null,
      });
      setRecurring(current => [...current, response.data].sort((a, b) => String(a.next_date).localeCompare(String(b.next_date))));
      loadCalendarEvents().catch(() => {});
      setModal(null);
      setError("");
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось создать регулярную операцию."); }
  };
  const toggleRecurring = async item => {
    try {
      const response = await api.patch(`/api/recurring-transactions/${item.id}`, { is_active: !item.is_active });
      setRecurring(current => current.map(entry => entry.id === item.id ? response.data : entry));
      loadCalendarEvents().catch(() => {});
    } catch { setError("Не удалось изменить регулярную операцию."); }
  };
  const removeRecurring = async item => {
    if (!window.confirm(`Удалить регулярную операцию «${item.name}»? Уже созданные плановые записи останутся.`)) return;
    try { await api.delete(`/api/recurring-transactions/${item.id}`); setRecurring(current => current.filter(entry => entry.id !== item.id)); loadCalendarEvents().catch(() => {}); }
    catch { setError("Не удалось удалить регулярную операцию."); }
  };
  const skipRecurring = async item => {
    if (!window.confirm(`Пропустить ближайшее повторение «${item.name}»?`)) return;
    try {
      const response = await api.post(`/api/recurring-transactions/${item.id}/skip`);
      setRecurring(current => current.map(entry => entry.id === item.id ? response.data : entry));
      loadCalendarEvents().catch(() => {});
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось пропустить повторение."); }
  };
  const finishRecurring = async item => {
    if (!window.confirm(`Завершить «${item.name}»? Новых повторений больше не будет.`)) return;
    try {
      const response = await api.post(`/api/recurring-transactions/${item.id}/finish`);
      setRecurring(current => current.map(entry => entry.id === item.id ? response.data : entry));
      loadCalendarEvents().catch(() => {});
    } catch { setError("Не удалось завершить регулярную операцию."); }
  };
  const showRecurringRuns = async item => {
    try { const response = await api.get(`/api/recurring-transactions/${item.id}/runs`); setRecurringRuns({ name: item.name, items: response.data || [] }); }
    catch { setError("Не удалось загрузить историю повторений."); }
  };
  const rotateCalendarLink = async () => {
    if (!window.confirm("Старая ссылка перестанет работать. Выпустить новую ссылку календаря?")) return;
    try { const response = await api.post("/api/calendar/subscription/rotate"); setCalendarUrl(response.data?.url || ""); setError(""); }
    catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось обновить ссылку календаря."); }
  };
  const copyCalendarLink = async () => {
    try { await navigator.clipboard.writeText(calendarUrl); setError("Ссылка календаря скопирована."); }
    catch { setError("Не удалось скопировать ссылку. Скопируйте её вручную."); }
  };

  return { obligations, transactions, accounts, categories, templates, recurring, calendarUrl, calendarMonth, setCalendarMonth, form, error, loading, saving, recurringRuns, setRecurringRuns, currencies, calendarEntries, change, save, makeActual, remove, modal, setModal, openTemplateModal, submitTemplate, applyTemplate, removeTemplate, openRecurringModal, submitRecurring, toggleRecurring, removeRecurring, skipRecurring, finishRecurring, showRecurringRuns, rotateCalendarLink, copyCalendarLink, load };
}
