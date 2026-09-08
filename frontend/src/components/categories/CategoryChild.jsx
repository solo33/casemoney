import { useDraggable } from "@dnd-kit/core";
import { isUncategorized } from "../../utils/categoriesView";
import { OrderButtons } from "./CategoryOrderButtons";

export function ChildNode({ child, onDelete, editingId, editForm, setEditForm, startEdit, cancelEdit, saveEdit, canMoveUp, canMoveDown, onMoveUp, onMoveDown }) {
  const isEditing = editingId === child.id;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `child-${child.id}`,
    data: { id: child.id, type: child.type, name: child.name, icon: child.icon, parent_id: child.parent_id },
    disabled: isEditing,
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.3 : 1,
  };

  if (isEditing) {
    return (
      <form
        onSubmit={(e) => saveEdit(e, child)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 8px", background: "#f6f2e9", borderRadius: 6, flexWrap: "wrap",
        }}
      >
        <input
          autoFocus
          value={editForm.name}
          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
          required
          style={{ fontSize: 13, padding: "5px 10px", flex: 1, minWidth: 120 }}
        />
        <input
          placeholder="🛒"
          value={editForm.icon}
          onChange={e => setEditForm({ ...editForm, icon: e.target.value })}
          style={{ width: 56, fontSize: 13, padding: "5px 10px" }}
        />
        <input
          type="color"
          value={editForm.color}
          onChange={e => setEditForm({ ...editForm, color: e.target.value })}
          style={{ width: 34, padding: 2, cursor: "pointer" }}
        />
        <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12 }} title={isUncategorized(child) ? "Эта категория всегда доступна для ввода" : undefined}>
          <input type="checkbox" disabled={isUncategorized(child)} checked={Boolean(editForm.is_hidden)} onChange={e => setEditForm({ ...editForm, is_hidden: e.target.checked })} />
          Скрыть
        </label>
        <button type="submit" style={{ fontSize: 13, padding: "5px 12px" }}>OK</button>
        <button type="button" onClick={cancelEdit} className="btn-ghost" style={{ fontSize: 13, padding: "5px 10px" }}>Отмена</button>
      </form>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 8px",
        fontSize: 14,
        background: "#f6f2e9",
        borderRadius: 6,
        cursor: "grab",
      }}
      {...listeners}
      {...attributes}
    >
      <span style={{
        width: 12, height: 12, borderRadius: 3,
        background: child.color, flexShrink: 0,
      }} />
      {child.icon && <span style={{ fontSize: 14 }}>{child.icon}</span>}
      <span style={{ flex: 1 }}>{child.name}</span>
      <OrderButtons
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        compact
      />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); startEdit(child); }}
        className="btn-ghost"
        style={{ padding: "2px 8px", fontSize: 12 }}
        onPointerDown={(e) => e.stopPropagation()}
        title="Редактировать"
      >
        ✎
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(child); }}
        className="btn-ghost"
        style={{ padding: "2px 8px", fontSize: 12, color: "#c0432b" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        ×
      </button>
    </div>
  );
}
