import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import api from "../api/client";

export default function Activate() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState({ status: "loading", message: "", alreadyVerified: false });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "Токен отсутствует в ссылке" });
      return;
    }
    api.get(`/api/auth/activate?token=${encodeURIComponent(token)}`)
      .then(r => setState({
        status: "ok",
        message: r.data.message,
        alreadyVerified: r.data.already_verified,
      }))
      .catch(e => setState({
        status: "error",
        message: e.response?.data?.detail || "Не удалось активировать аккаунт",
      }));
  }, [token]);

  return (
    <div style={{
      minHeight: "100svh",
      background: "linear-gradient(180deg, #faf8f3 0%, #f5f3ee 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        background: "#fff", border: "1px solid #e7e5e0", borderRadius: 12,
        padding: 36, maxWidth: 460, width: "100%", textAlign: "center",
      }}>
        <div style={{
          fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600,
          color: "#9f1239", marginBottom: 24,
        }}>
          ₽ CaseMoney
        </div>

        {state.status === "loading" && (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <h2 style={{ margin: 0, fontFamily: "var(--serif)" }}>Активируем...</h2>
          </>
        )}

        {state.status === "ok" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12, color: "#15803d" }}>✓</div>
            <h2 style={{
              margin: "0 0 12px", fontFamily: "var(--serif)",
              color: state.alreadyVerified ? "#57534e" : "#15803d",
            }}>
              {state.alreadyVerified ? "Уже подтверждён" : "Аккаунт активирован"}
            </h2>
            <p style={{ color: "#78716c", margin: "0 0 24px" }}>{state.message}</p>
            <Link
              to="/login"
              style={{
                display: "inline-block",
                background: "#9f1239", color: "#fff",
                padding: "10px 24px", borderRadius: 6,
                textDecoration: "none", fontWeight: 600,
              }}
            >
              Войти
            </Link>
          </>
        )}

        {state.status === "error" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12, color: "#b91c1c" }}>✕</div>
            <h2 style={{ margin: "0 0 12px", fontFamily: "var(--serif)", color: "#b91c1c" }}>
              Ошибка активации
            </h2>
            <p style={{ color: "#78716c", margin: "0 0 24px" }}>{state.message}</p>
            <p style={{ fontSize: 13, color: "#a8a29e", marginBottom: 20 }}>
              Возможно, ссылка истекла (срок 24 часа). Запросите новую — на странице входа.
            </p>
            <Link
              to="/login"
              className="btn-ghost"
              style={{
                display: "inline-block",
                border: "1px solid #e7e5e0",
                padding: "10px 24px", borderRadius: 6,
                textDecoration: "none", color: "#57534e",
              }}
            >
              На главную
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
