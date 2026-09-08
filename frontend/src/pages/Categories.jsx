
import SettingsTabs from "../components/SettingsTabs";
import { DndContext, DragOverlay } from "@dnd-kit/core";

import { useCategoriesController } from "../hooks/useCategoriesController";
import { TYPE_COLOR } from "../utils/categoriesView";
import { Section } from "../components/categories/CategorySection";

export default function Categories() {
  const { loading, error, setError, expanded, addingTo, setAddingTo, subForm, setSubForm, editingId, editForm, setEditForm, rootForm, setRootForm, activeDrag, sensors, toggleExpand, handleCreateRoot, handleCreateSubcategory, startEdit, cancelEdit, saveEdit, handleDelete, handleDragStart, handleDragEnd, handleReorder, grouped } = useCategoriesController();
  if (loading) return <div className="page">Загрузка...</div>;

  return (
    <div className="page">
      <h1>Категории</h1>
      <SettingsTabs />

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
          handleReorder={handleReorder}
          {...{ expanded, toggleExpand, addingTo, setAddingTo, subForm, setSubForm, handleCreateSubcategory, handleDelete, activeDrag, editingId, editForm, setEditForm, startEdit, cancelEdit, saveEdit }}
        />
        <div style={{ height: 24 }} />
        <Section
          title="Доходы"
          color="#167a4a"
          roots={grouped.income}
          handleReorder={handleReorder}
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
