import { useState, useEffect, useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
} from "@dnd-kit/core";
import api from "../api/client";

const TYPE_COLOR = { income: "#167a4a", expense: "#c0432b" };
const TYPE_LABEL = { income: "Доходы", expense: "Расходы" };

export default function Categories() {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [addingTo, setAddingTo] = useState(null); // root.id для которого открыта форма
  const [subForm, setSubForm] = useState({ name: "", icon: "", color: "#173a54" });
  const [editingId, setEditingId] = useState(null);   // id редактируемой категории
  const [editForm, setEditForm] = useState({ name: "", icon: "", color: "#173a54" });
  const [rootForm, setRootForm] = useState({
    name: "", type: "expense", color: "#173a54", icon: "",
  });
  const [activeDrag, setActiveDrag] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const fetchTree = async () => {
    try {
      const res = await api.get("/api/categories/tree");
      setTree(res.data);
    } catch {
      setError("Ошибка загрузки категорий");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTree(); }, []);

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreateRoot = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = { ...rootForm };
      if (!payload.icon) delete payload.icon;
      await api.post("/api/categories/", payload);
      setRootForm({ name: "", type: rootForm.type, color: "#173a54", icon: "" });
      fetchTree();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка создания");
    }
  };

  const handleCreateSubcategory = async (e, parent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name: subForm.name,
        type: parent.type,
        parent_id: parent.id,
        color: subForm.color || parent.color,
      };
      if (subForm.icon) payload.icon = subForm.icon;
      await api.post("/api/categories/", payload);
      setSubForm({ name: "", icon: "", color: "#173a54" });
      setAddingTo(null);
      setExpanded(prev => new Set(prev).add(parent.id)); // открыть, чтобы было видно
      fetchTree();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка создания подкатегории");
    }
  };

  const startEdit = (cat) => {
    setEditingId(cat.id);
    setEditForm({ name: cat.name, icon: cat.icon || "", color: cat.color || "#173a54" });
    setAddingTo(null);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (e, cat) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name: editForm.name,
        color: editForm.color,
        icon: editForm.icon || null,
      };
      await api.put(`/api/categories/${cat.id}`, payload);
      setEditingId(null);
      fetchTree();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось сохранить");
    }
  };

  const handleDelete = async (cat) => {
    const hasChildren = cat.children && cat.children.length > 0;
    const msg = hasChildren
      ? `Удалить «${cat.name}» вместе с ${cat.children.length} подкатегор${cat.children.length === 1 ? "ией" : "иями"}? Все дочерние будут удалены каскадно.`
      : `Удалить «${cat.name}»?`;
    if (!confirm(msg)) return;
    try {
      await api.delete(`/api/categories/${cat.id}`);
      fetchTree();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось удалить");
    }
  };

  const handleDragStart = (event) => {
    setActiveDrag(event.active.data.current);
  };

  const handleDragEnd = async (event) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const dragged = active.data.current; // {id, type, name, parent_id}
    const target = over.data.current;    // {id, type} of root
    if (!dragged || !target) return;
    if (dragged.parent_id === target.id) return; // тот же родитель
    if (dragged.type !== target.type) {
      setError("Можно переносить только между категориями одного типа");
      return;
    }

    try {
      await api.put(`/api/categories/${dragged.id}`, { parent_id: target.id });
      fetchTree();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось переместить");
    }
  };

  const grouped = useMemo(() => {
    return {
      expense: tree.filter(r => r.type === "expense"),
      income:  tree.filter(r => r.type === "income"),
    };
  }, [tree]);

  if (loading) return <div className="page">Загрузка...</div>;

  return (
    <div className="page">
      <h1>Категории</h1>

      {error && (
        <p style={{ color: "#c0432b", marginBottom: 12 }}>
          {error}{" "}
          <button onClick={() => setError(null)} className="btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }}>×</button>
        </p>
      )}

      <form onSubmit={handleCreateRoot} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <select
          value={rootForm.type}
          onChange={e => setRootForm({ ...rootForm, type: e.target.value })}
          style={{ color: TYPE_COLOR[rootForm.type], fontWeight: 600 }}
        >
          <option value="expense">Расход</option>
          <option value="income">Доход</option>
        </select>
        <input
          placeholder="Новая категория"
          value={rootForm.name}
          onChange={e => setRootForm({ ...rootForm, name: e.target.value })}
          required
        />
        <input
          placeholder="Иконка"
          value={rootForm.icon}
          onChange={e => setRootForm({ ...rootForm, icon: e.target.value })}
          style={{ width: 90 }}
        />
        <input
          type="color"
          value={rootForm.color}
          onChange={e => setRootForm({ ...rootForm, color: e.target.value })}
          style={{ width: 44, padding: 4, cursor: "pointer" }}
        />
        <button type="submit">Добавить</button>
      </form>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <Section
          title="Расходы"
          color="#c0432b"
          roots={grouped.expense}
          {...{ expanded, toggleExpand, addingTo, setAddingTo, subForm, setSubForm, handleCreateSubcategory, handleDelete, activeDrag, editingId, editForm, setEditForm, startEdit, cancelEdit, saveEdit }}
        />
        <div style={{ height: 24 }} />
        <Section
          title="Доходы"
          color="#167a4a"
          roots={grouped.income}
          {...{ expanded, toggleExpand, addingTo, setAddingTo, subForm, setSubForm, handleCreateSubcategory, handleDelete, activeDrag, editingId, editForm, setEditForm, startEdit, cancelEdit, saveEdit }}
        />

        <DragOverlay>
          {activeDrag ? (
            <div style={{
              background: "#fffdf7",
              border: "2px solid #173a54",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 14,
              fontWeight: 500,
              boxShadow: "0 8px 16px rgba(0,0,0,0.15)",
            }}>
              {activeDrag.icon ? `${activeDrag.icon} ` : ""}{activeDrag.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Section({
  title, color, roots,
  expanded, toggleExpand,
  addingTo, setAddingTo, subForm, setSubForm,
  handleCreateSubcategory, handleDelete,
  activeDrag,
  editingId, editForm, setEditForm, startEdit, cancelEdit, saveEdit,
}) {
  return (
    <div>
      <h3 style={{
        fontSize: 13, color: "#7a8590", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: 0.5,
        marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
        {title} <span style={{ color: "#a6afb8" }}>({roots.length})</span>
      </h3>

      {roots.length === 0 ? (
        <p style={{ color: "#a6afb8", fontSize: 14 }}>Нет категорий</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {roots.map(root => (
            <RootNode
              key={root.id}
              root={root}
              isExpanded={expanded.has(root.id)}
              onToggle={() => toggleExpand(root.id)}
              isAdding={addingTo === root.id}
              setAdding={(v) => setAddingTo(v ? root.id : null)}
              subForm={subForm}
              setSubForm={setSubForm}
              onSubmitSub={(e) => handleCreateSubcategory(e, root)}
              onDelete={handleDelete}
              activeDrag={activeDrag}
              editingId={editingId}
              editForm={editForm}
              setEditForm={setEditForm}
              startEdit={startEdit}
              cancelEdit={cancelEdit}
              saveEdit={saveEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RootNode({ root, isExpanded, onToggle, isAdding, setAdding, subForm, setSubForm, onSubmitSub, onDelete, activeDrag, editingId, editForm, setEditForm, startEdit, cancelEdit, saveEdit }) {
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
          {root.children.map(child => (
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChildNode({ child, onDelete, editingId, editForm, setEditForm, startEdit, cancelEdit, saveEdit }) {
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
