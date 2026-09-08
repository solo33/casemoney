import { useEffect, useMemo, useCallback } from "react";
import { preferredAccountCurrency, accountCurrencies as currenciesForAccount, isSameTransferCurrency, transferDisplayRate, swapTransferFields } from "../utils/transactionForm";
import useTransferQuote from "./useTransferQuote";

export function useTransactionTransferDraft(newTx, setNewTx, accounts) {
  // Когда меняется выбранный счёт в форме создания — подкорректировать валюту
  useEffect(() => {
    if (!newTx.account_id || !accounts.length) return;
    const acc = accounts.find(a => String(a.id) === String(newTx.account_id));
    if (!acc?.balances?.length) return;
    const currency = preferredAccountCurrency(acc, newTx.currency);
    if (currency !== newTx.currency) {
      setNewTx(t => ({ ...t, currency }));
    }
  }, [newTx.account_id, accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(newTx.account_id)),
    [accounts, newTx.account_id]
  );
  const newTxCurrencies = currenciesForAccount(selectedAccount);
  const selectedTargetAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(newTx.to_account_id)),
    [accounts, newTx.to_account_id]
  );
  const newTxTargetCurrencies = currenciesForAccount(selectedTargetAccount);
  const sameNewTransferCurrency = isSameTransferCurrency(newTx.type, newTx.currency, newTx.to_currency);

  useEffect(() => {
    if (newTx.type !== "transfer" || !selectedTargetAccount) return;
    if (!newTxTargetCurrencies.includes(newTx.to_currency)) {
      setNewTx(current => ({ ...current, to_currency: newTxTargetCurrencies[0] || "", to_amount: "" }));
    }
  }, [newTx.type, selectedTargetAccount, newTxTargetCurrencies.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyNewTransferQuote = useCallback(toAmount => {
    setNewTx(current => current.to_amount === toAmount ? current : { ...current, to_amount: toAmount });
  }, [setNewTx]);
  const { loading: newQuoteLoading } = useTransferQuote({
    enabled: newTx.type === "transfer" && !sameNewTransferCurrency,
    amount: newTx.amount,
    fromCurrency: newTx.currency,
    toCurrency: newTx.to_currency,
    onQuote: applyNewTransferQuote,
  });
  const newDisplayedRate = transferDisplayRate({ amount: newTx.amount, toAmount: newTx.to_amount });

  const swapNewTransferAccounts = () => {
    if (!newTx.account_id || !newTx.to_account_id) return;
    setNewTx(current => swapTransferFields(current, sameNewTransferCurrency));
  };

  return { newTxCurrencies, newTxTargetCurrencies, sameNewTransferCurrency, newQuoteLoading, newDisplayedRate, swapNewTransferAccounts };
}
