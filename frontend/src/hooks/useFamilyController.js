import { useState, useCallback, useEffect, useMemo } from "react";

import api from "../api/client";

import { formatMoney } from "../utils/money";

export function useFamilyController() {
  const now = new Date();
  const [state, setState] = useState({ family: null, pending_invitations: [] });
  const [report, setReport] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [recurringSuggestions, setRecurringSuggestions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [familyAccounts, setFamilyAccounts] = useState({ accounts: [], members: [] });
  const [pendingExpenses, setPendingExpenses] = useState({ items: [], categories: [], accounts: [] });
  const [pendingCategoryDrafts, setPendingCategoryDrafts] = useState({});
  const [pendingAccountDrafts, setPendingAccountDrafts] = useState({});
  const [shareDraft, setShareDraft] = useState({ account_id: "", members: {} });
  const [analyticsPeriod, setAnalyticsPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [familyName, setFamilyName] = useState("Наша семья");
  const [inviteEmail, setInviteEmail] = useState("");
  const [settlement, setSettlement] = useState({
    to_user_id: "",
    from_account_id: "",
    to_account_id: "",
    amount: "",
    currency: "RUB",
    description: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exportingReport, setExportingReport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const familyResponse = await api.get("/api/family/");
      setState(familyResponse.data);
      if (familyResponse.data.family) {
        const isOwner = familyResponse.data.family.current_user_role === "owner";
        const [reportResponse, analyticsResponse, suggestionsResponse, accountsResponse, familyAccountsResponse, pendingResponse] = await Promise.all([
          api.get("/api/family/report", { params: analyticsPeriod }),
          api.get("/api/family/analytics", { params: analyticsPeriod }),
          api.get("/api/family/recurring-suggestions"),
          api.get("/api/accounts/"),
          api.get("/api/family/accounts"),
          isOwner ? api.get("/api/family/expense-accounting/pending", { params: analyticsPeriod }) : Promise.resolve({ data: { items: [], categories: [], accounts: [] } }),
        ]);
        setReport(reportResponse.data);
        setAnalytics(analyticsResponse.data);
        setRecurringSuggestions(suggestionsResponse.data.items || []);
        setAccounts(accountsResponse.data || []);
        setFamilyAccounts(familyAccountsResponse.data || { accounts: [], members: [] });
        const pendingData = pendingResponse.data || { items: [], categories: [], accounts: [] };
        setPendingExpenses(pendingData);
        setPendingCategoryDrafts(Object.fromEntries(
          (pendingData.items || []).map(item => [item.id, String(item.suggested_owner_category_id || "")])
        ));
        setPendingAccountDrafts({});
      } else {
        setReport(null);
        setAnalytics(null);
        setRecurringSuggestions([]);
        setAccounts([]);
        setFamilyAccounts({ accounts: [], members: [] });
        setPendingExpenses({ items: [], categories: [], accounts: [] });
        setPendingCategoryDrafts({});
        setPendingAccountDrafts({});
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось загрузить семейные финансы");
    } finally {
      setLoading(false);
    }
  }, [analyticsPeriod, setState, setReport, setAnalytics, setRecurringSuggestions, setAccounts, setFamilyAccounts, setPendingExpenses, setPendingCategoryDrafts, setPendingAccountDrafts, setError, setLoading]);

  useEffect(() => { load(); }, [load]);

  const submit = async (action) => {
    setError("");
    setMessage("");
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось сохранить изменения");
    }
  };

  const activeMembers = state.family?.members?.filter(member => member.status === "active") || [];
  const ownAccounts = accounts.filter(account => account.user_id === state.family?.current_user_id);
  const pendingTotalsByAccount = useMemo(() => {
    const totals = {};
    pendingExpenses.items.forEach(item => {
      const accountId = pendingAccountDrafts[item.id];
      if (!accountId) return;
      const key = `${accountId}:${item.currency}`;
      totals[key] = (totals[key] || 0) + Number(item.amount || 0);
    });
    return Object.entries(totals).map(([key, amount]) => {
      const [accountId, currency] = key.split(":");
      return { account: pendingExpenses.accounts.find(item => String(item.id) === accountId), currency, amount };
    });
  }, [pendingExpenses, pendingAccountDrafts]);
  const selectedSharedAccount = familyAccounts.accounts.find(account => account.id === Number(shareDraft.account_id));
  const roleLabel = (role) => ({ owner: "Владелец", editor: "Редактор", viewer: "Наблюдатель", member: "Редактор" }[role] || role);

  const selectAccountForSharing = (accountId) => {
    const shared = familyAccounts.accounts.find(item => item.id === Number(accountId));
    setShareDraft({
      account_id: accountId,
      members: Object.fromEntries((shared?.access || []).map(item => [item.user_id, item.permission])),
    });
  };

  const downloadAnalyticsPdf = async () => {
    setError("");
    setExportingReport(true);
    try {
      const response = await api.get("/api/family/analytics/pdf", {
        params: analyticsPeriod,
        responseType: "blob",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(response.data);
      link.download = `casemoney-family-${analyticsPeriod.year}-${String(analyticsPeriod.month).padStart(2, "0")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch {
      setError("Не удалось сформировать PDF-отчёт. Попробуйте ещё раз.");
    } finally {
      setExportingReport(false);
    }
  };

  const emailAnalytics = async () => {
    setError("");
    setMessage("");
    setExportingReport(true);
    try {
      const response = await api.post("/api/family/analytics/email", analyticsPeriod);
      setMessage(`Семейный отчёт отправлен на ${response.data.email}`);
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось отправить отчёт. Попробуйте ещё раз.");
    } finally {
      setExportingReport(false);
    }
  };
  const currencyOptions = useMemo(() => {
    const values = new Set(["RUB"]);
    report?.outstanding?.forEach(item => values.add(item.currency));
    return [...values];
  }, [report]);

  const selectSettlementRecipient = async (memberUserId) => {
    setSettlement(current => ({ ...current, to_user_id: memberUserId, to_account_id: "" }));
  };

  const changeLabel = (change) => {
    if (!change) return "—";
    const sign = change.amount > 0 ? "+" : "";
    const percent = change.percent === null ? "нет базы для сравнения" : `${sign}${change.percent}%`;
    return `${sign}${formatMoney(change.amount)} · ${percent}`;
  };
  return { state, report, analytics, recurringSuggestions, pendingExpenses, pendingCategoryDrafts, setPendingCategoryDrafts, pendingAccountDrafts, setPendingAccountDrafts, shareDraft, setShareDraft, analyticsPeriod, setAnalyticsPeriod, familyName, setFamilyName, inviteEmail, setInviteEmail, settlement, setSettlement, message, setMessage, error, setError, loading, exportingReport, submit, activeMembers, ownAccounts, pendingTotalsByAccount, selectedSharedAccount, roleLabel, selectAccountForSharing, downloadAnalyticsPdf, emailAnalytics, currencyOptions, selectSettlementRecipient, changeLabel };
}
