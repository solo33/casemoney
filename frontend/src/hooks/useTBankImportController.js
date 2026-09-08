import { useNavigate } from "react-router-dom";
import { useRef, useState } from "react";

import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";

export function useTBankImportController() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [accountMappings, setAccountMappings] = useState({});
  const [categoryMappings, setCategoryMappings] = useState({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setAccountMappings({});
    setCategoryMappings({});
    setConfirmed(false);
    setError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const chooseFile = (selected) => {
    if (!selected) return;
    setFile(selected);
    setPreview(null);
    setResult(null);
    setError(null);
    setConfirmed(false);
  };

  const upload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await api.post("/api/import/tbank/preview", body, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30_000,
      });
      setPreview(response.data);
      setAccountMappings(Object.fromEntries(
        response.data.source_accounts.map((item) => [
          item.source_key,
          item.mapped_account_id ?? "",
        ]),
      ));
      setCategoryMappings(Object.fromEntries(
        response.data.source_categories.map((item) => [
          item.mapping_key,
          item.mapped_category_id ?? "",
        ]),
      ));
      setConfirmed(false);
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail
        || "Не удалось прочитать выгрузку Т‑Банка",
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const normalizeMappings = (mappings) => Object.fromEntries(
        Object.entries(mappings).map(([key, value]) => [
          key,
          value === "" ? null : Number(value),
        ]),
      );
      const response = await api.post("/api/import/tbank/confirm", {
        import_token: preview.import_token,
        account_mappings: normalizeMappings(accountMappings),
        category_mappings: normalizeMappings(categoryMappings),
      }, {
        timeout: 30_000,
      });
      setResult(response.data);
      window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail
        || "Не удалось импортировать операции",
      );
    } finally {
      setImporting(false);
    }
  };

  const mappedOperations = preview
    ? preview.rows.filter((row) => {
      if (row.error || row.duplicate) return false;
      if (!accountMappings[row.source_key]) return false;
      if (row.tx_type === "transfer" && !accountMappings[row.target_source_key]) {
        return false;
      }
      return accountMappings[row.source_key] !== accountMappings[row.target_source_key];
    }).length
    : 0;
  return { navigate, inputRef, file, preview, accountMappings, setAccountMappings, categoryMappings, setCategoryMappings, loading, importing, confirmed, setConfirmed, error, setError, result, reset, chooseFile, upload, confirmImport, mappedOperations };
}
