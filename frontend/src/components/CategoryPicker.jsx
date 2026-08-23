import { useEffect, useMemo, useState } from "react";
import CategoryOptions from "./CategoryOptions";
import api from "../api/client";

const isUncategorized = category => (
  category.name.trim().toLocaleLowerCase("ru-RU") === "без категории"
);

const compareByName = (left, right) => {
  const uncategorizedOrder = Number(isUncategorized(left)) - Number(isUncategorized(right));
  if (uncategorizedOrder !== 0) return uncategorizedOrder;
  return left.name.localeCompare(right.name, "ru", { sensitivity: "base" });
};

const labelFor = category => `${category.icon ? `${category.icon} ` : ""}${category.name}`;
const normalize = value => value.trim().toLocaleLowerCase("ru-RU");
// Tag-cloud effect for "часто используемые": more uses -> visually bigger, up to a cap.
const weightFor = (uses, maxUses) => (
  maxUses > 0 ? Math.round(12 + (Math.min(uses, maxUses) / maxUses) * 6) : 12
);

export default function CategoryPicker({
  categories = [],
  value,
  onChange,
  placeholder = "— не выбрана —",
  style,
  className = "",
  onCategoryCreated,
}) {
  const [open, setOpen] = useState(false);
  const [frequent, setFrequent] = useState([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  // A hidden group must hide its children too. The exception is an already
  // saved category while editing an old operation: it stays available together
  // with its parent, so the operation can be corrected without losing it.
  const visibleCategories = useMemo(() => {
    const byId = new Map(categories.map(category => [String(category.id), category]));
    const selectedId = value == null || value === "" ? null : String(value);

    return categories.filter(category => {
      const isSelected = String(category.id) === selectedId;
      const parent = category.parent_id == null ? null : byId.get(String(category.parent_id));
      const isSelectedParent = parent && String(parent.id) === selectedId;

      if (isSelected || isSelectedParent) return true;
      return !category.is_hidden && !(parent && parent.is_hidden);
    });
  }, [categories, value]);
  const selected = categories.find(category => String(category.id) === String(value));

  const groups = useMemo(() => {
    const childrenByParent = new Map();
    visibleCategories.forEach(category => {
      if (category.parent_id == null) return;
      const children = childrenByParent.get(category.parent_id) || [];
      children.push(category);
      childrenByParent.set(category.parent_id, children);
    });
    const roots = visibleCategories.filter(category => category.parent_id == null).sort(compareByName);
    const rootIds = new Set(roots.map(category => category.id));
    const orphans = visibleCategories
      .filter(category => category.parent_id != null && !rootIds.has(category.parent_id))
      .sort(compareByName);
    return { roots, childrenByParent, orphans };
  }, [visibleCategories]);

  const categoryType = useMemo(
    () => visibleCategories.find(category => category.type)?.type,
    [visibleCategories]
  );

  const filteredGroups = useMemo(() => {
    const term = normalize(query);
    if (!term) return groups;
    const matches = category => normalize(category.name).includes(term);
    const roots = groups.roots.filter(parent => (
      matches(parent) || (groups.childrenByParent.get(parent.id) || []).some(matches)
    ));
    const childrenByParent = new Map();
    roots.forEach(parent => {
      const children = groups.childrenByParent.get(parent.id) || [];
      childrenByParent.set(parent.id, matches(parent) ? children : children.filter(matches));
    });
    const orphans = groups.orphans.filter(matches);
    return { roots, childrenByParent, orphans };
  }, [groups, query]);

  const filteredFrequent = useMemo(() => {
    const term = normalize(query);
    return term ? frequent.filter(category => normalize(category.name).includes(term)) : frequent;
  }, [frequent, query]);

  const hasResults = filteredGroups.roots.length > 0 || filteredGroups.orphans.length > 0 || filteredFrequent.length > 0;
  const maxFrequentUses = useMemo(() => Math.max(0, ...frequent.map(category => category.uses || 0)), [frequent]);

  useEffect(() => {
    if (!open) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [open]);

  useEffect(() => {
    if (open) return;
    setQuery("");
    setCreating(false);
    setNewName("");
    setCreateError("");
  }, [open]);

  useEffect(() => {
    if (!open || navigator.onLine === false) return undefined;
    const type = visibleCategories.find(category => category.type)?.type;
    if (type !== "income" && type !== "expense") {
      setFrequent([]);
      return undefined;
    }
    let active = true;
    api.get("/api/transactions/frequent-categories", { params: { tx_type: type, limit: 6 } })
      .then(response => {
        if (!active) return;
        const allowed = new Set(visibleCategories.map(category => String(category.id)));
        setFrequent(response.data.filter(category => allowed.has(String(category.id))));
      })
      .catch(() => { if (active) setFrequent([]); });
    return () => { active = false; };
  }, [open, visibleCategories]);

  const choose = nextValue => {
    onChange(String(nextValue));
    setOpen(false);
  };

  const submitCreate = async event => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || !categoryType) return;
    setCreateBusy(true);
    setCreateError("");
    try {
      const response = await api.post("/api/categories/", { name, type: categoryType });
      onCategoryCreated?.(response.data);
      choose(response.data.id);
    } catch (requestError) {
      setCreateError(requestError.response?.data?.detail || "Не удалось создать категорию");
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <div className={`category-picker ${className}`} style={style}>
      <select
        className="category-picker-native"
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        <CategoryOptions categories={visibleCategories} />
      </select>

      <button
        type="button"
        className="category-picker-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span>{selected ? labelFor(selected) : placeholder}</span>
        <span aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className="category-picker-backdrop" onClick={() => setOpen(false)}>
          <section
            className="category-picker-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Выбор категории"
            onClick={event => event.stopPropagation()}
          >
            <div className="category-picker-handle" />
            <div className="category-picker-heading">
              <strong>Категория</strong>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Закрыть</button>
            </div>
            <div className="category-picker-search">
              <input
                type="search"
                inputMode="search"
                placeholder="Поиск категории"
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
                autoFocus
              />
            </div>
            <div className="category-picker-list">
              {!query && (
                <button type="button" className="category-picker-empty" onClick={() => choose("")}>
                  {placeholder}
                </button>
              )}
              {filteredFrequent.length > 0 && <div className="category-picker-frequent">
                <span>Часто используемые</span>
                <div>{filteredFrequent.map(category => (
                  <button
                    type="button"
                    key={category.id}
                    style={{ fontSize: `${weightFor(category.uses, maxFrequentUses)}px` }}
                    onClick={() => choose(category.id)}
                  >
                    {labelFor(category)}
                  </button>
                ))}</div>
              </div>}
              {filteredGroups.roots.map(parent => (
                <div className="category-picker-group" key={parent.id}>
                  <button type="button" className="category-picker-parent" onClick={() => choose(parent.id)}>
                    {labelFor(parent)}
                  </button>
                  {(filteredGroups.childrenByParent.get(parent.id) || []).sort(compareByName).map(child => (
                    <button type="button" className="category-picker-child" key={child.id} onClick={() => choose(child.id)}>
                      {labelFor(child)}
                    </button>
                  ))}
                </div>
              ))}
              {filteredGroups.orphans.map(category => (
                <button type="button" className="category-picker-parent" key={category.id} onClick={() => choose(category.id)}>
                  {labelFor(category)}
                </button>
              ))}
              {!hasResults && (
                <p className="category-picker-empty-state">Ничего не найдено{query ? ` по «${query}»` : ""}.</p>
              )}
            </div>
            {onCategoryCreated && (
              <div className="category-picker-create">
                {creating ? (
                  <div className="category-picker-create-form">
                    <input
                      type="text"
                      placeholder="Название категории"
                      value={newName}
                      onChange={event => setNewName(event.target.value)}
                      onKeyDown={event => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        submitCreate(event);
                      }}
                      autoFocus
                    />
                    <button type="button" disabled={createBusy || !newName.trim()} onClick={submitCreate}>
                      {createBusy ? "Создаём…" : "Создать"}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => { setCreating(false); setNewName(""); setCreateError(""); }}>
                      Отмена
                    </button>
                    {createError && <span className="category-picker-create-error">{createError}</span>}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="category-picker-create-trigger"
                    onClick={() => { setCreating(true); setNewName(query); }}
                  >
                    + Создать категорию{query ? ` «${query}»` : ""}
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
