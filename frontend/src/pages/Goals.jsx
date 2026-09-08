
import { useGoalsController } from "../hooks/useGoalsController";
import { GoalForm, GoalCard } from "../components/goals/GoalsParts";

export default function Goals() {
  const { accounts, loading, error, adding, editId, form, setForm, startAdd, startEdit, cancel, save, del, archive, restore, activeGoals, archivedGoals } = useGoalsController();
  if (loading) return <div className="page">Загрузка...</div>;

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Цели</h1>
        <button onClick={startAdd}>+ Цель</button>
      </div>

      {error && (
        <div style={{
          color: "#c0432b", padding: "8px 12px", marginBottom: 12,
          background: "#fef2f0", border: "1px solid #fecdd3", borderRadius: 8,
        }}>{error}</div>
      )}

      {(adding || editId) && (
        <GoalForm
          form={form} setForm={setForm}
          accounts={accounts}
          onSubmit={save}
          onCancel={cancel}
          isEdit={!!editId}
        />
      )}

      {activeGoals.length === 0 && !adding ? (
        <div style={{
          background: "#fffdf7", border: "1px dashed #c7cdd3", borderRadius: 10,
          padding: 32, textAlign: "center", color: "#a6afb8",
        }}>
          Нет целей. Например — «Резервный фонд 3 000 000 ₽» или «Машина 2 000 000 ₽».
          <br /><br />
          <button onClick={startAdd}>Создать первую</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {activeGoals.map(g => (
            <GoalCard key={g.id} g={g} onEdit={() => startEdit(g)} onDelete={() => del(g)} onArchive={() => archive(g)} />
          ))}
        </div>
      )}
      {archivedGoals.length > 0 && (
        <details className="goals-archive" style={{ marginTop: 18 }}>
          <summary>Архив целей ({archivedGoals.length})</summary>
          <p>Достигнутые и отложенные цели. Их можно вернуть без потери истории взносов.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {archivedGoals.map(g => <GoalCard key={g.id} g={g} archived onRestore={() => restore(g)} onDelete={() => del(g)} />)}
          </div>
        </details>
      )}
    </div>
  );
}
