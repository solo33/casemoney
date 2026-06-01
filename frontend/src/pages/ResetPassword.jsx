import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api/auth";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [form, setForm] = useState({ p1: "", p2: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.p1.length < 4) { setError("Пароль не короче 4 символов"); return; }
    if (form.p1 !== form.p2) { setError("Пароли не совпадают"); return; }
    setBusy(true);
    try {
      await resetPassword(token, form.p1);
      setDone(true);
      setTimeout(() => navigate("/login"), 1800);
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось сбросить пароль");
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
        <h1 style={{ fontSize: 24, marginBottom: 16 }}>Новый пароль</h1>

        {!token ? (
          <p style={{ color: "#c0432b" }}>Ссылка недействительна. Запросите сброс заново.</p>
        ) : done ? (
          <p style={{ color: "#167a4a" }}>Пароль изменён. Перенаправляем на вход…</p>
        ) : (
          <form onSubmit={submit}>
            <input
              type="password" required autoFocus minLength={4} autoComplete="new-password"
              placeholder="Новый пароль"
              value={form.p1}
              onChange={e => setForm({ ...form, p1: e.target.value })}
              style={{ width: "100%", marginBottom: 12 }}
            />
            <input
              type="password" required minLength={4} autoComplete="new-password"
              placeholder="Повторите пароль"
              value={form.p2}
              onChange={e => setForm({ ...form, p2: e.target.value })}
              style={{ width: "100%", marginBottom: 16 }}
            />
            {error && <p style={{ color: "#c0432b", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button type="submit" disabled={busy} style={{ width: "100%", padding: "12px" }}>
              {busy ? "Сохраняем..." : "Сохранить пароль"}
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
