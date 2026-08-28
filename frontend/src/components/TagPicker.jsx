import { useMemo, useState } from "react";
import api from "../api/client";

/** Compact multi-select for optional personal projects/tags. */
export default function TagPicker({ tags, value = [], onChange, onTagCreated, disabled = false }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const selected = useMemo(() => new Set((value || []).map(String)), [value]);

  const toggle = (tagId) => {
    const key = String(tagId);
    const next = selected.has(key)
      ? [...selected].filter(id => id !== key)
      : [...selected, key];
    onChange(next);
  };

  const create = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      setError("");
      const response = await api.post("/api/tags/", { name: trimmed });
      const tag = response.data;
      onTagCreated?.(tag);
      onChange([...selected, String(tag.id)]);
      setName("");
      setCreating(false);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось создать метку");
    }
  };

  return (
    <div className="tag-picker" aria-label="Метки и проекты">
      <div className="tag-picker-options">
        {tags.map(tag => (
          <button
            type="button"
            key={tag.id}
            disabled={disabled}
            className={`tag-chip${selected.has(String(tag.id)) ? " is-selected" : ""}`}
            style={selected.has(String(tag.id)) ? { "--tag-color": tag.color } : undefined}
            onClick={() => toggle(tag.id)}
          >{tag.name}</button>
        ))}
        {!disabled && <button type="button" className="tag-picker-add" onClick={() => setCreating(open => !open)}>+ метка</button>}
      </div>
      {creating && (
        <form className="tag-picker-create" onSubmit={create}>
          <input autoFocus value={name} maxLength={64} placeholder="Например, ремонт" onChange={e => setName(e.target.value)} />
          <button type="submit">Добавить</button>
          <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>Отмена</button>
          {error && <small>{error}</small>}
        </form>
      )}
    </div>
  );
}
