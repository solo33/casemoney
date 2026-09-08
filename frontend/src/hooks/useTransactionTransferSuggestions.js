import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { formatMoney, currencySymbol } from "../utils/money";

export function useTransactionTransferSuggestions(user, loadTransactions, loadAccounts, setNotice) {
  const [transferSuggestions, setTransferSuggestions] = useState([]);
  const [transferFees, setTransferFees] = useState({});
  const [matchingTransferId, setMatchingTransferId] = useState(null);
  const showTransferSuggestions = Boolean(user?.show_transfer_suggestions);
  const loadTransferSuggestions = useCallback(() => {
    if (!showTransferSuggestions) {
      setTransferSuggestions([]);
      return;
    }
    api.get("/api/transactions/transfer-suggestions")
      .then(response => setTransferSuggestions(response.data || []))
      .catch(() => setTransferSuggestions([]));
  }, [showTransferSuggestions]);
  useEffect(() => { loadTransferSuggestions(); }, [loadTransferSuggestions]);
  const confirmTransferSuggestion = async (suggestion) => {
    const message = `Связать списание ${formatMoney(suggestion.amount)} ${currencySymbol(suggestion.currency)} со счёта «${suggestion.account_name}» и поступление на «${suggestion.to_account_name}» как перевод?`;
    if (!window.confirm(message)) return;
    setMatchingTransferId(suggestion.expense_id);
    try {
      const feeCategoryId = transferFees[suggestion.expense_id];
      await api.post(`/api/transactions/${suggestion.expense_id}/confirm-transfer-match`, {
        income_transaction_id: suggestion.income_id,
        ...(feeCategoryId ? { fee_category_id: Number(feeCategoryId) } : {}),
      });
      setNotice("Операции объединены в перевод между своими счетами.");
      loadTransactions();
      loadAccounts();
      loadTransferSuggestions();
    } catch (requestError) {
      setNotice(requestError.response?.data?.detail || "Не удалось сопоставить операции.");
    } finally {
      setMatchingTransferId(null);
    }
  };

  return { showTransferSuggestions, transferSuggestions, transferFees, setTransferFees, matchingTransferId, confirmTransferSuggestion };
}
