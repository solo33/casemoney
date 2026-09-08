import { useState } from "react";
import { QUICK_ADD_OPEN_EVENT } from "../QuickAddFab";

export function Onboarding({ hasAccounts, hasTx, onDismiss, navigate }) {
  const [step, setStep] = useState(0);
  const steps = [
    { title: "Выберите основную валюту", desc: "Она будет использоваться для общего баланса и отчётов." },
    { title: "Проверьте начальные счета", desc: hasAccounts ? "Начальные счета уже созданы. Переименуйте или удалите ненужные." : "Создайте карту, наличные или другой первый счёт." },
    { title: "Добавьте данные", desc: "Начните вручную с одной записи или импортируйте историю из файла." },
    { title: "Готово к работе", desc: hasTx ? "Данные уже появились — можно смотреть баланс и анализ." : "После первой записи на главной появятся баланс и статистика." },
  ];
  const current = steps[step];
  const finish = () => onDismiss();
  const openQuickAdd = () => {
    onDismiss();
    window.dispatchEvent(new CustomEvent(QUICK_ADD_OPEN_EVENT));
  };
  return (
    <div className="onboarding-wizard" style={{
      background: "linear-gradient(100deg, #173a54, #0f293d)",
      color: "var(--text-on-dark)", borderRadius: 12, padding: 20,
      position: "relative",
    }}>
      <button
        type="button" onClick={onDismiss}
        style={{
          position: "absolute", top: 12, right: 12, background: "transparent",
          border: "none", color: "rgba(244,241,232,0.6)", fontSize: 18, cursor: "pointer",
        }}
        title="Скрыть"
      >×</button>
      <div style={{ color: "rgba(244,241,232,.65)", fontSize: 12, marginBottom: 8 }}>Шаг {step + 1} из {steps.length}</div>
      <div style={{ display: "flex", gap: 5, margin: "0 42px 16px 0" }}>
        {steps.map((_, index) => <span key={index} style={{ height: 4, flex: 1, borderRadius: 4, background: index <= step ? "#c2a05a" : "rgba(255,255,255,.18)" }} />)}
      </div>
      <h2 style={{ fontFamily: "var(--font-display)", color: "#fff", margin: "0 0 4px", fontSize: 22 }}>
        Добро пожаловать в CaseMoney
      </h2>
      <h3 style={{ color: "#fff", margin: "14px 0 6px" }}>{current.title}</h3>
      <p style={{ color: "rgba(244,241,232,0.8)", margin: "0 0 18px", fontSize: 14 }}>
        {current.desc}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {step === 0 && <button type="button" onClick={() => navigate("/settings/currencies")} className="btn-ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>Настроить валюту</button>}
        {step === 1 && <button type="button" onClick={() => navigate("/accounts")} className="btn-ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>Открыть счета</button>}
        {step === 2 && <>
          <button type="button" onClick={openQuickAdd} style={{ background: "#c2a05a", color: "#0a1d2c", borderColor: "#c2a05a" }}>Добавить вручную</button>
          <button type="button" onClick={() => navigate("/import")} className="btn-ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>Импортировать</button>
        </>}
        {step > 0 && <button type="button" onClick={() => setStep(s => s - 1)} className="btn-link" style={{ color: "rgba(255,255,255,.75)" }}>Назад</button>}
        {step < steps.length - 1
          ? <button type="button" onClick={() => setStep(s => s + 1)} style={{ marginLeft: "auto", background: "#fff", color: "#173a54", borderColor: "#fff" }}>Продолжить</button>
          : <button type="button" onClick={finish} style={{ marginLeft: "auto", background: "#c2a05a", color: "#0a1d2c", borderColor: "#c2a05a" }}>Начать</button>}
      </div>
    </div>
  );
}
