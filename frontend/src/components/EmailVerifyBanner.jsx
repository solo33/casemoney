import { useState } from "react";
import { useUser } from "../contexts/UserContext";
import { resendActivation } from "../api/auth";

export default function EmailVerifyBanner() {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!user || user.email_verified) return null;

  const resend = async () => {
    setBusy(true); setMsg("");
    try {
      await resendActivation(user.email);
      setMsg("Письмо отправлено. Проверьте папку Спам.");
    } catch {
      setMsg("Не удалось отправить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: "#f4ead3", borderBottom: "1px solid #facc15",
      padding: "10px 24px",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 12, flexWrap: "wrap",
      fontSize: 13, color: "#78350f",
    }}>
      <span>
        📬 Подтвердите email <strong>{user.email}</strong> — мы отправили ссылку при регистрации.
      </span>
      <span>
        Подтвердите адрес в течение 7 дней. После этого доступ будет
        приостановлен до подтверждения.
      </span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {msg && <span style={{ fontSize: 12, color: "#78350f" }}>{msg}</span>}
        <button
          onClick={resend}
          disabled={busy}
          className="btn-ghost"
          style={{
            padding: "4px 12px", fontSize: 12,
            border: "1px solid #ca8a04", color: "#846630",
            background: "rgba(255,255,255,0.5)",
          }}
        >
          {busy ? "..." : "Отправить ещё раз"}
        </button>
      </div>
    </div>
  );
}
