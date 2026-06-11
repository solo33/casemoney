import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const KEY = "cm_cookie_consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem(KEY) !== "accepted");
  }, []);

  if (!visible) return null;

  const accept = () => {
    localStorage.setItem(KEY, "accepted");
    setVisible(false);
  };

  return (
    <div style={{
      position: "fixed",
      left: 16,
      right: 16,
      bottom: 16,
      zIndex: 2000,
      display: "flex",
      justifyContent: "center",
      pointerEvents: "none",
    }}>
      <div style={{
        maxWidth: 760,
        width: "100%",
        background: "#fffdf7",
        border: "1px solid #e4ddcd",
        borderRadius: 10,
        boxShadow: "0 16px 36px rgba(15,30,45,0.18)",
        padding: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        pointerEvents: "auto",
      }}>
        <p style={{ margin: 0, flex: 1, minWidth: 260, color: "#515c68", fontSize: 13, lineHeight: 1.45 }}>
          CaseMoney использует необходимые cookie и localStorage для входа, безопасности и сохранения настроек интерфейса.
          Подробнее: <Link to="/cookies" style={{ color: "#9c7b3c" }}>соглашение о cookie</Link>.
        </p>
        <button type="button" onClick={accept} style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>
          Понятно
        </button>
      </div>
    </div>
  );
}
