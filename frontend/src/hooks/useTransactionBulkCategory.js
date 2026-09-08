import { useEffect, useState } from "react";
import api from "../api/client";

export function useTransactionBulkCategory({ data, categories, filters, page, loadTransactions, setError, setNotice }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  useEffect(() => { setSelectedIds([]); setBulkCategoryId(""); }, [filters, page]);
  const selectedTransactions = data.items.filter(item => selectedIds.includes(item.id));
  const selectedType = selectedTransactions.length ? selectedTransactions[0].type : null;
  const canBulkCategorize = selectedTransactions.length > 0
    && selectedTransactions.every(item => item.type === selectedType)
    && selectedType !== "transfer";
  const bulkCategories = selectedType ? categories.filter(item => item.type === selectedType) : [];
  const toggleSelection = (id) => setSelectedIds(current => current.includes(id)
    ? current.filter(item => item !== id)
    : [...current, id]);
  const toggleAllPage = () => setSelectedIds(current => {
    const ids = data.items.map(item => item.id);
    return ids.length > 0 && ids.every(id => current.includes(id)) ? [] : ids;
  });
  const applyBulkCategory = async () => {
    if (!canBulkCategorize || !bulkCategoryId) return;
    setBulkSaving(true);
    setError(null);
    try {
      const response = await api.patch("/api/transactions/bulk/category", {
        transaction_ids: selectedIds,
        category_id: Number(bulkCategoryId),
      });
      setSelectedIds([]);
      setBulkCategoryId("");
      setNotice(`Категория обновлена у ${response.data.updated} ${response.data.updated === 1 ? "записи" : "записей"}.`);
      loadTransactions();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось изменить категории.");
    } finally { setBulkSaving(false); }
  };

  return { selectedIds, setSelectedIds, bulkCategoryId, setBulkCategoryId, bulkSaving, canBulkCategorize, bulkCategories, toggleSelection, toggleAllPage, applyBulkCategory };
}
