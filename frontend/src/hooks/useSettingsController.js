import { useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { useState } from "react";
import api from "../api/client";
import { normalizeDashboardWidgets as normalizedWidgetSettings } from "../utils/dashboardWidgets";

export function useSettingsController() {
  const navigate = useNavigate();
  const { user, refresh, limits, updateUser } = useUser();
  const [emailForm, setEmailForm] = useState({ email: "", username: "" });
  const [pwdForm, setPwdForm] = useState({ current_password: "", new_password: "", repeat: "" });
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  // Подставим текущие значения когда user загрузится
  if (user && !emailForm.email && !emailForm.username) {
    setEmailForm({ email: user.email, username: user.username });
  }

  const flash = (text, isError = false) => {
    if (isError) { setError(text); setMsg(null); }
    else { setMsg(text); setError(null); }
    setTimeout(() => { setError(null); setMsg(null); }, 3000);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      await api.put("/api/me/", emailForm);
      await refresh();
      flash("Профиль обновлён");
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка", true);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwdForm.new_password !== pwdForm.repeat) {
      flash("Пароли не совпадают", true); return;
    }
    try {
      await api.post("/api/me/password", {
        current_password: pwdForm.current_password,
        new_password: pwdForm.new_password,
      });
      setPwdForm({ current_password: "", new_password: "", repeat: "" });
      flash("Пароль изменён");
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка смены пароля", true);
    }
  };

  const saveDisplayPreferences = async (changes) => {
    try {
      await updateUser(changes);
      flash("Настройки отображения сохранены");
    } catch (e) {
      flash(e.response?.data?.detail || "Не удалось сохранить настройки", true);
    }
  };

  const changeMode = async (mode) => {
    const isPersonal = mode === "personal";
    if (isPersonal && !confirm("Перейти на Personal? Если вы состоите в семейном пространстве, доступ к общим данным будет прекращён. Владелец семейного пространства удалит его вместе с общими списками, целями и взаиморасчётами. Личные счета и операции сохранятся.")) return;
    try {
      await updateUser({ preferred_mode: mode, ...(isPersonal ? { confirm_family_data_cleanup: true } : {}) });
      flash(mode === "family" ? "Выбран режим Family" : "Выбран режим Personal");
      if (isPersonal) navigate("/settings/personal");
    } catch (e) {
      flash(e.response?.data?.detail || "Не удалось изменить режим", true);
    }
  };

  const saveWidgetSettings = async (next) => saveDisplayPreferences({ dashboard_widgets: next });
  const updateWidget = async (id, changes) => {
    const current = normalizedWidgetSettings(user.dashboard_widgets);
    await saveWidgetSettings({ ...current, [id]: { ...current[id], ...changes } });
  };
  const moveWidget = async (id, direction) => {
    const current = normalizedWidgetSettings(user.dashboard_widgets);
    const ordered = Object.entries(current).sort((a, b) => a[1].order - b[1].order);
    const index = ordered.findIndex(([key]) => key === id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index][1].order, ordered[target][1].order] = [ordered[target][1].order, ordered[index][1].order];
    await saveWidgetSettings(Object.fromEntries(ordered));
  };

  const deleteAllRecords = async () => {
    if (!confirm("Удалить ВСЕ транзакции? Балансы счетов обнулятся. Восстановить нельзя.")) return;
    try {
      await api.delete("/api/me/transactions");
      flash("Все транзакции удалены");
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка", true);
    }
  };

  const resetAll = async () => {
    if (!confirm("Начать всё с начала?\n\nБудут удалены: транзакции, счета, группы, категории, валюты.\nАккаунт сохранится, но всё содержимое исчезнет навсегда.")) return;
    if (!confirm("Точно? Это действие необратимо.")) return;
    try {
      await api.post("/api/me/reset");
      flash("Все данные удалены. Перезагрузите страницу.");
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка", true);
    }
  };

  const deleteAccount = async () => {
    const confirm1 = prompt(`Чтобы удалить аккаунт, введите ваш email: ${user?.email}`);
    if (confirm1 !== user?.email) {
      if (confirm1 !== null) alert("Email не совпал. Удаление отменено.");
      return;
    }
    try {
      await api.delete("/api/me/");
      localStorage.removeItem("token");
      navigate("/login");
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка удаления", true);
    }
  };
  return { user, limits, emailForm, setEmailForm, pwdForm, setPwdForm, error, msg, flash, saveProfile, changePassword, saveDisplayPreferences, changeMode, updateWidget, moveWidget, deleteAllRecords, resetAll, deleteAccount };
}
