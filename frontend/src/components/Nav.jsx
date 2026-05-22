import { NavLink, useNavigate } from "react-router-dom";

const links = [
  { to: "/dashboard", label: "Главная" },
  { to: "/accounts", label: "Счета" },
  { to: "/categories", label: "Категории" },
  { to: "/transactions", label: "Транзакции" },
];

export default function Nav() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <nav style={{
      display: "flex",
      gap: "16px",
      alignItems: "center",
      padding: "12px 24px",
      borderBottom: "1px solid #ddd",
      marginBottom: "16px",
    }}>
      <span style={{ fontWeight: "bold", marginRight: "8px" }}>CaseMoney</span>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          style={({ isActive }) => ({
            textDecoration: "none",
            fontWeight: isActive ? "bold" : "normal",
            color: isActive ? "#6366f1" : "#333",
          })}
        >
          {l.label}
        </NavLink>
      ))}
      <button
        onClick={handleLogout}
        style={{ marginLeft: "auto", cursor: "pointer" }}
      >
        Выйти
      </button>
    </nav>
  );
}
