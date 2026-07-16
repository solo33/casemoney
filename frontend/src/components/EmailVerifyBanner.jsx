import { useState } from "react";
import { useUser } from "../contexts/UserContext";
import { resendActivation } from "../api/auth";

export default function EmailVerifyBanner() {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [expanded, setExpanded] = useState(false);

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
    <div className="email-verify-banner" style={{
      background: "#f4ead3", borderBottom: "1px solid #facc15",
      padding: "10px 24px",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 12, flexWrap: "wrap",
      fontSize: 13, color: "#78350f",
    }}>
      <span className="email-verify-main">
        📬 Подтвердите <strong>{user.email}</strong>
      </span>
      <span className={`email-verify-details${expanded ? " is-open" : ""}`}>
        Подтвердите адрес в течение 7 дней. После этого доступ будет
        приостановлен до подтверждения.
      </span>
      <div className="email-verify-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {msg && <span style={{ fontSize: 12, color: "#78350f" }}>{msg}</span>}
        <button type="button" onClick={() => setExpanded(v => !v)} className="btn-link email-verify-more">
          {expanded ? "Скрыть" : "Подробнее"}
        </button>
        <button
          onClick={resend}
          disabled={busy}
          className="btn-ghost"
          style={{
            minHeight: 36, padding: "4px 12px", fontSize: 12,
            border: "1px solid #ca8a04", color: "#846630",
            background: "rgba(255,255,255,0.5)",
          }}
        >
          {busy ? "..." : "Отправить ещё раз"}
        </button>
      </div>
      <style>{`
        .email-verify-more { display: none; }
        @media (max-width: 767px) {
          .email-verify-banner { padding: 7px 12px !important; gap: 5px 8px !important; flex-wrap: wrap !important; }
          .email-verify-main { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .email-verify-details { display: none; order: 3; width: 100%; padding: 4px 0; }
          .email-verify-details.is-open { display: block; }
          .email-verify-actions { flex-shrink: 0; }
          .email-verify-actions > span { position: absolute; left: 12px; right: 12px; top: 104px; background: #fffdf7; padding: 8px; border-radius: 8px; box-shadow: var(--shadow-md); z-index: 10; }
          .email-verify-more { display: inline-flex; min-height: 36px; align-items: center; font-size: 12px; }
        }
      `}</style>
    </div>
  );
}
