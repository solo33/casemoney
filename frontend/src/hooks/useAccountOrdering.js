import { useState } from "react";
import { useSensors, useSensor, PointerSensor, KeyboardSensor } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { UNGROUPED_KEY } from "../utils/accountsView";
import api from "../api/client";

export function useAccountOrdering({ groups, fetchGroups, setError }) {
  const [activeDrag, setActiveDrag] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // --- DnD ---

  const handleDragStart = (event) => {
    setActiveDrag(event.active.data.current);
  };

  const bucketKey = (b) => (b.group.id ?? UNGROUPED_KEY);

  const handleDragEnd = async (event) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const dragged = active.data.current;        // { type:'account', accountId, groupKey }
    const overData = over.data.current;
    if (!dragged || !overData) return;

    // Целевая группа: либо группа счёта-цели, либо сам droppable группы
    const targetKey = overData.type === "group" ? overData.groupKey : overData.groupKey;
    const sameGroup = dragged.groupKey === targetKey;

    const targetBucket = groups.find(b => bucketKey(b) === targetKey);
    if (!targetBucket) return;
    const targetIds = targetBucket.accounts.map(a => a.id);

    // Индекс вставки
    let insertIdx;
    if (overData.type === "account") {
      insertIdx = targetIds.indexOf(overData.accountId);
      if (insertIdx < 0) insertIdx = targetIds.length;
    } else {
      insertIdx = targetIds.length; // дроп на пустую область группы → в конец
    }

    let newOrder;
    if (sameGroup) {
      const oldIdx = targetIds.indexOf(dragged.accountId);
      if (oldIdx < 0 || oldIdx === insertIdx) return;
      newOrder = arrayMove(targetIds, oldIdx, insertIdx);
    } else {
      newOrder = [...targetIds];
      newOrder.splice(insertIdx, 0, dragged.accountId);
    }

    const body = { account_ids: newOrder };
    if (!sameGroup) body.group_id = targetKey === UNGROUPED_KEY ? null : targetKey;

    try {
      await api.post("/api/accounts/reorder", body);
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось изменить порядок");
      fetchGroups();
    }
  };

  return { activeDrag, sensors, handleDragStart, handleDragEnd };
}
