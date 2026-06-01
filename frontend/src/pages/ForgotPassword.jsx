import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [smtp, setSmtp] = useState(true);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await forgotPassword(email);
      setSmtp(r.data?.smtp_configured ?? true);
      setSent(true);
    } catch {
      setSent(true); // не раскрываем, есть ли такой email
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100svh", background: "linear-gradient(180deg, #f6f2e9 0%, #efe9db 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{
        background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 14,
        padding: 32, maxWidth: 440, width: "100%",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20 }}>
          <img src="/icon.svg" alt="" width={32} height={32} style={{ borderRadius: 9 }} />
          <span style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600, color: "#173a54" }}>CaseMoney</span>
        </div>

        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Восстановление пароля</h1>

        {sent ? (
          <>
            <p style={{ color: "#515c68", fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
              Если аккаунт с таким email существует, мы отправили на него ссылку
              для сброса пароля. Ссылка действительна 1 час.
            </p>
            {!smtp && (
              <p style={{
                background: "#f4ead3", border: "1px solid #facc15", color: "#846630",
                borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 16,
              }}>
                SMTP не настроен — ссылка выведена в консоль backend (dev-режим).
              </p>
            )}
            <Link to="/login" style={{ color: "#9c7b3c", fontWeight: 500 }}>← Ко входу</Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <p style={{ color: "#7a8590", fontSize: 14, marginBottom: 16 }}>
              Укажите email — пришлём ссылку для сброса пароля.
            </p>
            <input
              type="email" required autoFocus
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: "100%", marginBottom: 16 }}
            />
            <button type="submit" disabled={busy} style={{ width: "100%", padding: "12px" }}>
              {busy ? "Отправляем..." : "Отправить ссылку"}
            </button>
            <p style={{ marginTop: 16, fontSize: 13, textAlign: "center" }}>
              <Link to="/login" style={{ color: "#9c7b3c", fontWeight: 500 }}>← Ко входу</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
