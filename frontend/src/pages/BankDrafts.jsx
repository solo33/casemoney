import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import AccountOptions, { entryAccountGroups } from "../components/AccountOptions";
import CategoryPicker from "../components/CategoryPicker";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { cachedAccountsAndCategories, saveReferenceData } from "../services/offlineReferenceData";
import { submitOrQueueTransaction } from "../services/offlineMutations";
import { currencySymbol, sortCurrenciesRubFirst } from "../utils/money";
import {
  BANK_DRAFTS_CHANGED_EVENT,
  clearBankNotificationDrafts,
  isBankNotificationImportAvailable,
  listBankNotificationDrafts,
  removeBankNotificationDraft,
} from "../services/bankNotificationImport";

function dateFromDraft(value) {
  return value ? value.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function defaultForm(draft, groups) {
  const account = entryAccountGroups(groups).flatMap(group => group.accounts || [])[0];
  const currencies = sortCurrenciesRubFirst((account?.balances || []).map(item => item.currency));
  return {
    account_id: account ? String(account.id) : "",
    category_id: "",
    amount: String(draft.amount || ""),
    currency: currencies.includes(draft.currency) ? draft.currency : (currencies[0] || draft.currency || "RUB"),
    description: draft.description || "Банковская операция",
    date: dateFromDraft(draft.createdAt),
  };
}

export default function BankDrafts() {
  const [drafts, setDrafts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [forms, setForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const localDrafts = await listBankNotificationDrafts();
      const cached = cachedAccountsAndCategories();
      let nextGroups = cached?.accountGroups || [];
      let nextCategories = cached?.categories || [];
      if (navigator.onLine !== false) {
        const [accountsResponse, categoriesResponse] = await Promise.all([
          api.get("/api/accounts/grouped", { params: { convert_balances: false }, skipGlobalProgress: true }),
          api.get("/api/categories/", { skipGlobalProgress: true }),
        ]);
        nextGroups = accountsResponse.data || [];
        nextCategories = categoriesResponse.data || [];
        saveReferenceData({ accountGroups: nextGroups, categories: nextCategories });
      }
      setGroups(nextGroups);
      setCategories(nextCategories);
      setDrafts(localDrafts);
      setForms(previous => Object.fromEntries(localDrafts.map(draft => [draft.id, previous[draft.id] || defaultForm(draft, nextGroups)])));
    } catch {
      setMessage("Не удалось загрузить счета и категории. Черновики остаются на телефоне.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(BANK_DRAFTS_CHANGED_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener(BANK_DRAFTS_CHANGED_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  const visibleAccounts = useMemo(() => entryAccountGroups(groups).flatMap(group => group.accounts || []), [groups]);
  const updateForm = (id, changes) => setForms(current => ({ ...current, [id]: { ...current[id], ...changes } }));

  const changeAccount = (draft, accountId) => {
    const account = visibleAccounts.find(item => String(item.id) === String(accountId));
    const allowed = sortCurrenciesRubFirst((account?.balances || []).map(item => item.currency));
    updateForm(draft.id, { account_id: accountId, currency: allowed.includes(forms[draft.id]?.currency) ? forms[draft.id].currency : (allowed[0] || forms[draft.id]?.currency || "RUB") });
  };

  const skip = async id => {
    await removeBankNotificationDraft(id);
    setDrafts(current => current.filter(item => item.id !== id));
  };

  const confirmDraft = async draft => {
    const form = forms[draft.id];
    if (!form?.account_id || !form?.amount || Number(form.amount) <= 0) {
      setMessage("Укажите счёт и корректную сумму.");
      return;
    }
    setBusyId(draft.id);
    setMessage("");
    try {
      const result = await submitOrQueueTransaction({
        type: draft.type === "income" ? "income" : "expense",
        account_id: Number(form.account_id),
        category_id: form.category_id ? Number(form.category_id) : undefined,
        amount: Number(form.amount),
        currency: form.currency,
        description: form.description.trim() || "Банковская операция",
        date: form.date,
      }, `bank-draft-${draft.id}`);
      await removeBankNotificationDraft(draft.id);
      setDrafts(current => current.filter(item => item.id !== draft.id));
      window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
      setMessage(result.queued ? "Черновик сохранён локально и будет синхронизирован при появлении сети." : "Операция добавлена.");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Не удалось учесть операцию. Черновик сохранён.");
    } finally {
      setBusyId(null);
    }
  };

  if (!isBankNotificationImportAvailable()) {
    return <div className="page" style={{ maxWidth: 760 }}><h1>Черновики из банка</h1><p className="muted">Импорт банковских уведомлений доступен только в приложении CaseMoney для Android.</p><Link to="/settings/personal">Открыть настройки →</Link></div>;
  }

  return (
    <div className="page bank-drafts-page" style={{ maxWidth: 860 }}>
      <div className="page-heading-row"><div><h1>Черновики из банка</h1><p className="muted">Уведомления разбираются только на этом телефоне. Пока вы не подтвердите черновик, баланс и отчёты не меняются.</p></div><Link className="btn-secondary" to="/settings/personal">Настроить</Link></div>
      {message && <p className="bank-drafts-message">{message}</p>}
      {loading ? <p className="muted">Загружаем черновики…</p> : drafts.length === 0 ? <div className="empty-state"><b>Новых банковских операций нет</b><span>После включения импорта они появятся здесь для проверки.</span></div> : <>
        <div className="bank-drafts-toolbar"><span>{drafts.length} {drafts.length === 1 ? "черновик" : "черновиков"}</span><button type="button" className="btn-ghost" onClick={async () => { if (confirm("Удалить все банковские черновики с этого телефона?")) { await clearBankNotificationDrafts(); setDrafts([]); } }}>Очистить все</button></div>
        <div className="bank-drafts-list">{drafts.map(draft => {
          const form = forms[draft.id] || defaultForm(draft, groups);
          const account = visibleAccounts.find(item => String(item.id) === String(form.account_id));
          const availableCurrencies = sortCurrenciesRubFirst((account?.balances || []).map(item => item.currency));
          return <article className="bank-draft-card" key={draft.id}>
            <header><div><span className={`bank-draft-type is-${draft.type}`}>{draft.type === "income" ? "Поступление" : "Расход"}</span><b>{draft.source || "Банк"}</b><small>{new Date(draft.createdAt).toLocaleString("ru-RU")}</small></div><strong className={draft.type === "income" ? "amount-income" : "amount-expense"}>{draft.type === "income" ? "+" : "−"}{draft.amount} {currencySymbol(draft.currency)}</strong></header>
            <div className="bank-draft-fields">
              <label>Счёт<select value={form.account_id} onChange={event => changeAccount(draft, event.target.value)}><option value="">Выберите счёт</option><AccountOptions groups={groups} /></select></label>
              <label>Валюта<select value={form.currency} onChange={event => updateForm(draft.id, { currency: event.target.value })}>{(availableCurrencies.length ? availableCurrencies : [draft.currency || "RUB"]).map(currency => <option key={currency} value={currency}>{currency}</option>)}</select></label>
              <label className="bank-draft-wide">Описание<input value={form.description} onChange={event => updateForm(draft.id, { description: event.target.value })} /></label>
              <label className="bank-draft-wide">Категория<CategoryPicker categories={categories.filter(category => category.type === draft.type)} value={form.category_id} onChange={category_id => updateForm(draft.id, { category_id })} onCategoryCreated={category => setCategories(current => [...current, category])} /></label>
            </div>
            <footer><button type="button" className="btn-ghost" onClick={() => skip(draft.id)} disabled={busyId === draft.id}>Пропустить</button><button type="button" onClick={() => confirmDraft(draft)} disabled={busyId === draft.id}>{busyId === draft.id ? "Сохраняем…" : "Учесть"}</button></footer>
          </article>;
        })}</div>
      </>}
    </div>
  );
}
