import { useNavigate } from "react-router-dom";
import { useState, useRef } from "react";

import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";

export function useImportFileController() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const inputRef = useRef(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setResult(null);
    setConfirmed(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = (f) => {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
    setConfirmed(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const onChange = (e) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  const upload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/api/import/preview", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(res.data);
      setConfirmed(false);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка обработки файла");
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const res = await api.post("/api/import/confirm", {
        import_token: preview.import_token,
      });
      setResult(res.data);
      // обновить дашборды
      window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка импорта");
    } finally {
      setImporting(false);
    }
  };
  return { navigate, file, preview, loading, importing, error, setError, result, dragOver, setDragOver, confirmed, setConfirmed, inputRef, reset, onDrop, onChange, upload, confirm };
}
