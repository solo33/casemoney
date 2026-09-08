import { useEffect, useState } from "react";
import api from "../api/client";

export function useTransactionCategorySuggestions(newTx, setNewTx, setNotice) {
  const [categorySuggestion, setCategorySuggestion] = useState(null);
  useEffect(() => {
    if (newTx.type === "transfer" || newTx.category_id || newTx.description.trim().length < 2 || navigator.onLine === false) {
      setCategorySuggestion(null);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get("/api/automation/category-suggestion", {
          params: { description: newTx.description, transaction_type: newTx.type },
        });
        if (!cancelled) setCategorySuggestion(response.data || null);
      } catch {
        if (!cancelled) setCategorySuggestion(null);
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [newTx.description, newTx.type, newTx.category_id]);

  const applyCategorySuggestion = () => {
    if (!categorySuggestion) return;
    setNewTx(current => ({ ...current, category_id: String(categorySuggestion.category_id) }));
    setCategorySuggestion(null);
  };

  const saveSuggestedCategoryRule = async () => {
    if (!categorySuggestion || newTx.description.trim().length < 2) return;
    try {
      await api.post("/api/automation/rules", {
        pattern: newTx.description,
        category_id: categorySuggestion.category_id,
      });
      setNotice(`Правило «${newTx.description.trim()} → ${categorySuggestion.category_name}» сохранено.`);
    } catch (requestError) {
      setNotice(requestError.response?.data?.detail || "Не удалось сохранить правило.");
    }
  };

  return { categorySuggestion, applyCategorySuggestion, saveSuggestedCategoryRule };
}
