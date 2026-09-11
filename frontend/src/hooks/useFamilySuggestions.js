import { useCallback, useEffect, useState } from "react";
import api from "../api/client";

export function useFamilySuggestions(onChanged) {
  const [hasFamily, setHasFamily] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const { data } = await api.get("/api/family/");
    setHasFamily(Boolean(data.family));
    if (!data.family) { setItems([]); return; }
    const response = await api.get("/api/family/recurring-suggestions");
    setItems(response.data.items || []);
  }, []);
  useEffect(() => { load().catch(() => setError("Не удалось загрузить предложения семейных платежей.")); }, [load]);
  const submit = async action => {
    setError("");
    setMessage("");
    try {
      await action();
      await load();
      await onChanged();
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось обновить семейные платежи.");
    }
  };
  return { hasFamily, items, error, message, setMessage, submit };
}
