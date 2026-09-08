import { useDroppable } from "@dnd-kit/core";
import { isUncategorized } from "../../utils/categoriesView";
import { OrderButtons } from "./CategoryOrderButtons";
import { ChildNode } from "./CategoryChild";

export function RootNode({ root, isExpanded, onToggle, isAdding, setAdding, subForm, setSubForm, onSubmitSub, onDelete, activeDrag, editingId, editForm, setEditForm, startEdit, cancelEdit, saveEdit, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onMoveChild }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `root-${root.id}`,
    data: { id: root.id, type: root.type },
  });

  const hasChildren = root.children && root.children.length > 0;
  const canAccept = activeDrag && activeDrag.type === root.type && activeDrag.parent_id !== root.id;
  const dropHighlight = isOver && canAccept;
  const isEditing = editingId === root.id;

  return (
    <div
      ref={setNodeRef}
      style={{
        background: "#fffdf7",
        border: `1px solid ${dropHighlight ? "#173a54" : "#e4ddcd"}`,
        borderRadius: 10,
        outline: dropHighlight ? "2px solid rgba(23, 58, 84, 0.25)" : "none",
        transition: "outline 0.1s, border-color 0.1s",
      }}
    >
      {/* Header / edit form */}
      {isEditing ? (
        <form onSubmit={(e) => saveEdit(e, root)} style={{
          display: "flex", gap: 6, padding: "10px 12px", flexWrap: "wrap", alignItems: "center",
        }}>
          <input
            autoFocus
            value={editForm.name}
            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
            required
            style={{ fontSize: 14, padding: "6px 10px", flex: 1, minWidth: 140 }}
          />
          <input
            placeholder="Иконка"
            value={editForm.icon}
            onChange={e => setEditForm({ ...editForm, icon: e.target.value })}
            style={{ width: 70, fontSize: 14, padding: "6px 10px" }}
          />
          <input
            type="color"
            value={editForm.color}
            onChange={e => setEditForm({ ...editForm, color: e.target.value })}
            style={{ width: 40, padding: 2, cursor: "pointer" }}
          />
          <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12 }} title={isUncategorized(root) ? "Эта категория всегда доступна для ввода" : undefined}>
            <input type="checkbox" disabled={isUncategorized(root)} checked={Boolean(editForm.is_hidden)} onChange={e => setEditForm({ ...editForm, is_hidden: e.target.checked })} />
            Скрыть при вводе
          </label>
          <button type="submit" style={{ fontSize: 13, padding: "6px 14px" }}>Сохранить</button>
          <button type="button" onClick={cancelEdit} className="btn-ghost" style={{ fontSize: 13, padding: "6px 12px" }}>Отмена</button>
        </form>
      ) : (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 12px",
        cursor: hasChildren ? "pointer" : "default",
      }} onClick={() => hasChildren && onToggle()}>
        <span style={{
          width: 18, height: 18, borderRadius: 5,
          background: root.color, flexShrink: 0,
        }} />
        {root.icon && <span style={{ fontSize: 18 }}>{root.icon}</span>}
        <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{root.name}</span>
        {hasChildren && (
          <span style={{ color: "#a6afb8", fontSize: 13 }}>
            {root.children.length} {isExpanded ? "▾" : "▸"}
          </span>
        )}
        <OrderButtons
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); startEdit(root); }}
          className="btn-ghost"
          style={{ padding: "4px 8px", fontSize: 13, lineHeight: 1 }}
          title="Редактировать"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setAdding(!isAdding); }}
          className="btn-ghost"
          style={{ padding: "4px 8px", fontSize: 14, lineHeight: 1 }}
          title="Добавить подкатегорию"
        >
          +
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(root); }}
          className="btn-danger"
          style={{ padding: "4px 8px", fontSize: 12 }}
        >
          Удалить
        </button>
      </div>
      )}

      {/* Subcategory inline form */}
      {isAdding && (
        <form
          onSubmit={onSubmitSub}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "flex", gap: 6, padding: "8px 12px 12px 40px", flexWrap: "wrap",
            borderTop: "1px solid #ece6d8",
          }}
        >
          <input
            autoFocus
            placeholder="Подкатегория"
            value={subForm.name}
            onChange={e => setSubForm({ ...subForm, name: e.target.value })}
            required
            style={{ fontSize: 13, padding: "5px 10px" }}
          />
          <input
            placeholder="🛒"
            value={subForm.icon}
            onChange={e => setSubForm({ ...subForm, icon: e.target.value })}
            style={{ width: 60, fontSize: 13, padding: "5px 10px" }}
          />
          <input
            type="color"
            value={subForm.color}
            onChange={e => setSubForm({ ...subForm, color: e.target.value })}
            style={{ width: 36, padding: 2, cursor: "pointer" }}
          />
          <button type="submit" style={{ fontSize: 13, padding: "5px 12px" }}>OK</button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="btn-ghost"
            style={{ fontSize: 13, padding: "5px 12px" }}
          >
            Отмена
          </button>
        </form>
      )}

      {/* Children */}
      {hasChildren && isExpanded && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 2,
          padding: "0 12px 12px 40px",
        }}>
          {root.children.map((child, childIndex) => (
            <ChildNode
              key={child.id}
              child={child}
              onDelete={onDelete}
              editingId={editingId}
              editForm={editForm}
              setEditForm={setEditForm}
              startEdit={startEdit}
              cancelEdit={cancelEdit}
              saveEdit={saveEdit}
              canMoveUp={childIndex > 0}
              canMoveDown={childIndex < root.children.length - 1}
              onMoveUp={() => onMoveChild(child.id, -1)}
              onMoveDown={() => onMoveChild(child.id, 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
