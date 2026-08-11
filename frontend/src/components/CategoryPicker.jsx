import { useEffect, useMemo, useState } from "react";
import CategoryOptions from "./CategoryOptions";

const isUncategorized = category => (
  category.name.trim().toLocaleLowerCase("ru-RU") === "без категории"
);

const compareByName = (left, right) => {
  const uncategorizedOrder = Number(isUncategorized(left)) - Number(isUncategorized(right));
  if (uncategorizedOrder !== 0) return uncategorizedOrder;
  return left.name.localeCompare(right.name, "ru", { sensitivity: "base" });
};

const labelFor = category => `${category.icon ? `${category.icon} ` : ""}${category.name}`;

export default function CategoryPicker({
  categories = [],
  value,
  onChange,
  placeholder = "— не выбрана —",
  style,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  // Hidden items remain selectable when editing an older operation that already
  // uses one, but are not offered for new input.
  const visibleCategories = useMemo(() => categories.filter(category => (
    !category.is_hidden || String(category.id) === String(value)
  )), [categories, value]);
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

  useEffect(() => {
    if (!open) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [open]);

  const choose = nextValue => {
    onChange(String(nextValue));
    setOpen(false);
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
            <div className="category-picker-list">
              <button type="button" className="category-picker-empty" onClick={() => choose("")}>
                {placeholder}
              </button>
              {groups.roots.map(parent => (
                <div className="category-picker-group" key={parent.id}>
                  <button type="button" className="category-picker-parent" onClick={() => choose(parent.id)}>
                    {labelFor(parent)}
                  </button>
                  {(groups.childrenByParent.get(parent.id) || []).sort(compareByName).map(child => (
                    <button type="button" className="category-picker-child" key={child.id} onClick={() => choose(child.id)}>
                      {labelFor(child)}
                    </button>
                  ))}
                </div>
              ))}
              {groups.orphans.map(category => (
                <button type="button" className="category-picker-parent" key={category.id} onClick={() => choose(category.id)}>
                  {labelFor(category)}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
