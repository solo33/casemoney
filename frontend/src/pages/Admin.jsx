
import { useUser } from "../contexts/UserContext";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { TabBtn } from "../components/admin/AdminParts";
import { UsersTab } from "../components/admin/AdminUsers";
import { NotificationsTab } from "../components/admin/AdminNotifications";
import { StatsTab } from "../components/admin/AdminStats";

export default function Admin() {
  const { user, loading: userLoading } = useUser();
  const [tab, setTab] = useState("users");

  if (userLoading) return <div className="page">Загрузка...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) {
    return (
      <div className="page" style={{ maxWidth: 600 }}>
        <h1>Доступ запрещён</h1>
        <p style={{ color: "#7a8590" }}>
          Эта страница доступна только администраторам.
        </p>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 1280 }}>
      <h1 style={{ marginBottom: 16 }}>Админка</h1>

      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        borderBottom: "1px solid #e4ddcd",
      }}>
        <TabBtn active={tab === "users"} onClick={() => setTab("users")}>Пользователи</TabBtn>
        <TabBtn active={tab === "notifications"} onClick={() => setTab("notifications")}>Уведомления</TabBtn>
        <TabBtn active={tab === "stats"} onClick={() => setTab("stats")}>Система</TabBtn>
      </div>

      {tab === "users" && <UsersTab adminId={user.id} />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "stats" && <StatsTab />}
    </div>
  );
}
