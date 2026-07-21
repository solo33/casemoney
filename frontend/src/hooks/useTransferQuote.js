import { useEffect, useState } from "react";
import api from "../api/client";

export default function useTransferQuote({
  enabled,
  amount,
  fromCurrency,
  toCurrency,
  onQuote,
}) {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const numericAmount = Number(amount);
    if (!enabled || !(numericAmount > 0) || !fromCurrency || !toCurrency) {
      setQuote(null);
      setLoading(false);
      return;
    }

    if (fromCurrency === toCurrency) {
      const sameCurrencyQuote = {
        converted: numericAmount,
        rate: 1,
        source: "same_currency",
      };
      setQuote(sameCurrencyQuote);
      onQuote(String(numericAmount));
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await api.get("/api/currencies/convert", {
          params: { amount: numericAmount, from: fromCurrency, to: toCurrency },
          signal: controller.signal,
          skipGlobalProgress: true,
        });
        if (controller.signal.aborted) return;
        setQuote(response.data);
        onQuote(String(response.data.converted));
      } catch (error) {
        if (!controller.signal.aborted && error.code !== "ERR_CANCELED") {
          setQuote(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, amount, fromCurrency, toCurrency, onQuote]);

  return { quote, loading };
}
