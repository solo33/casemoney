import { RootNode } from "./CategoryRoot";

export function Section({
  title, color, roots,
  expanded, toggleExpand,
  addingTo, setAddingTo, subForm, setSubForm,
  handleCreateSubcategory, handleDelete,
  handleReorder,
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
          {roots.map((root, rootIndex) => (
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
              canMoveUp={rootIndex > 0}
              canMoveDown={rootIndex < roots.length - 1}
              onMoveUp={() => handleReorder(roots, root.id, -1, null)}
              onMoveDown={() => handleReorder(roots, root.id, 1, null)}
              onMoveChild={(childId, direction) => (
                handleReorder(root.children || [], childId, direction, root.id)
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
