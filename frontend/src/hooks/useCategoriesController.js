import { useState, useEffect, useMemo } from "react";
import { useSensors, useSensor, PointerSensor, KeyboardSensor } from "@dnd-kit/core";

import api from "../api/client";

export function useCategoriesController() {
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
    setEditForm({ name: cat.name, icon: cat.icon || "", color: cat.color || "#173a54", is_hidden: Boolean(cat.is_hidden) });
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
        is_hidden: Boolean(editForm.is_hidden),
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

  const handleReorder = async (siblings, categoryId, direction, parentId) => {
    const currentIndex = siblings.findIndex(category => category.id === categoryId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;

    const categoryIds = siblings.map(category => category.id);
    [categoryIds[currentIndex], categoryIds[targetIndex]] = [
      categoryIds[targetIndex], categoryIds[currentIndex],
    ];
    setError(null);
    try {
      await api.post("/api/categories/reorder", {
        category_ids: categoryIds,
        parent_id: parentId,
      });
      await fetchTree();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось изменить порядок");
    }
  };

  const grouped = useMemo(() => {
    return {
      expense: tree.filter(r => r.type === "expense"),
      income:  tree.filter(r => r.type === "income"),
    };
  }, [tree]);
  return { loading, error, setError, expanded, addingTo, setAddingTo, subForm, setSubForm, editingId, editForm, setEditForm, rootForm, setRootForm, activeDrag, sensors, toggleExpand, handleCreateRoot, handleCreateSubcategory, startEdit, cancelEdit, saveEdit, handleDelete, handleDragStart, handleDragEnd, handleReorder, grouped };
}
