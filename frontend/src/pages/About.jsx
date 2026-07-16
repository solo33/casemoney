import { useState } from "react";
import { APP_FULL_VERSION } from "../config/version";
import { SUPPORT_EMAIL } from "../config/contacts";
import { PublicPage, card, paragraph } from "./Articles";

export default function About() {
  const [updateStatus, setUpdateStatus] = useState("idle");

  const checkForUpdates = async () => {
    setUpdateStatus("checking");
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.update()));
      }
      setUpdateStatus("ready");
      window.setTimeout(() => window.location.reload(), 500);
    } catch {
      setUpdateStatus("error");
    }
  };

  return (
    <PublicPage title="О программе">
      <div style={{ display: "grid", gap: 16 }}>
        <section style={{ ...card, textAlign: "center" }}>
          <img src="/icon.svg" alt="" width={72} height={72} style={{ borderRadius: 18 }} />
          <h2 style={{ margin: "12px 0 4px", fontSize: 26, color: "#173a54" }}>CaseMoney</h2>
          <p style={{ ...paragraph, margin: "0 auto", maxWidth: 560 }}>
            Сервис личных финансов: счета, операции, категории, валюты, импорт и анализ в одном месте.
          </p>
        </section>

        <section style={card}>
          <InfoRow label="Версия" value={APP_FULL_VERSION} mono />
          <InfoRow label="Сайт" value={<a href="https://casemoney.ru">casemoney.ru</a>} />
          <InfoRow label="Поддержка" value={<a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>} />
          <div style={{ marginTop: 18 }}>
            <button type="button" onClick={checkForUpdates} disabled={updateStatus === "checking"}>
              {updateStatus === "checking" ? "Проверяем обновления…" : "Проверить обновления"}
            </button>
            {updateStatus === "ready" && <p style={statusStyle}>Проверка завершена. Приложение перезапускается…</p>}
            {updateStatus === "error" && <p style={{ ...statusStyle, color: "#b42318" }}>Не удалось проверить обновления. Попробуйте ещё раз.</p>}
          </div>
        </section>

        <section style={{ ...card, color: "#515c68", fontSize: 14, lineHeight: 1.6 }}>
          <div>© 2026 CaseMoney. Все права защищены.</div>
          <div>Использование сервиса регулируется Пользовательским соглашением и Политикой конфиденциальности.</div>
        </section>
      </div>
    </PublicPage>
  );
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 20, padding: "11px 0", borderBottom: "1px solid #ece6d8" }}>
      <span style={{ color: "#7a8590" }}>{label}</span>
      <span style={{ color: "#173a54", fontWeight: 600, fontFamily: mono ? "var(--font-mono)" : undefined }}>{value}</span>
    </div>
  );
}

const statusStyle = {
  margin: "10px 0 0",
  color: "#287a52",
  fontSize: 13,
};
