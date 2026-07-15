const isUncategorized = category => (
  category.name.trim().toLocaleLowerCase("ru-RU") === "без категории"
);

const compareByName = (left, right) => {
  const uncategorizedOrder = Number(isUncategorized(left)) - Number(isUncategorized(right));
  if (uncategorizedOrder !== 0) return uncategorizedOrder;
  return left.name.localeCompare(right.name, "ru", { sensitivity: "base" });
};

const categoryLabel = category => (
  `${category.icon ? `${category.icon} ` : ""}${category.name}`
);

/**
 * Единый список категорий для нативного select.
 * Группы и их дочерние категории сортируются отдельно по алфавиту.
 * Первая строка optgroup дублирует группу как обычный option, потому что
 * сам HTML-элемент optgroup выбрать нельзя.
 */
export default function CategoryOptions({ categories }) {
  const byParent = new Map();
  categories.forEach(category => {
    if (category.parent_id == null) return;
    const children = byParent.get(category.parent_id) || [];
    children.push(category);
    byParent.set(category.parent_id, children);
  });

  const roots = categories
    .filter(category => category.parent_id == null)
    .sort(compareByName);
  const knownRootIds = new Set(roots.map(category => category.id));
  const orphanedChildren = categories
    .filter(category => (
      category.parent_id != null && !knownRootIds.has(category.parent_id)
    ))
    .sort(compareByName);

  return (
    <>
      {roots.map(parent => {
        const children = (byParent.get(parent.id) || []).sort(compareByName);
        if (children.length === 0) {
          return (
            <option key={parent.id} value={parent.id} style={{ fontWeight: 700 }}>
              {categoryLabel(parent)}
            </option>
          );
        }

        return (
          <optgroup key={parent.id} label={categoryLabel(parent)}>
            <option value={parent.id} style={{ fontWeight: 700 }}>
              {categoryLabel(parent)}
            </option>
            {children.map(child => (
              <option key={child.id} value={child.id}>
                ↳ {categoryLabel(child)}
              </option>
            ))}
          </optgroup>
        );
      })}
      {orphanedChildren.map(category => (
        <option key={category.id} value={category.id}>
          {categoryLabel(category)}
        </option>
      ))}
    </>
  );
}
