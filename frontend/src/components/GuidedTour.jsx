import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/client";
import { useUser } from "../contexts/UserContext";

export const START_GUIDED_TOUR_EVENT = "casemoney:start-guided-tour";

const STEPS = [
  { path: "/home", target: ".app-nav-brand", title: "Добро пожаловать в CaseMoney", text: "Здесь собраны личные и семейные финансы. Пройдёмся по самым важным разделам за минуту." },
  { path: "/home", target: '[data-tour="balance"]', title: "Ваш баланс", text: "Здесь — общий остаток и суммы по валютам. Он обновляется после каждой учтённой операции." },
  { path: "/home", target: '[data-tour="quick-add"]', mobileTarget: '[data-tour="quick-add-mobile"]', title: "Добавляйте операции быстро", text: "Расход, доход или перевод можно внести прямо с главной. На телефоне для этого есть кнопка «+»." },
  { path: "/accounts", target: '[data-tour="accounts"]', title: "Счета и остатки", text: "Создайте наличные, карту, вклад или другой счёт. У одного счёта может быть несколько валют." },
  { path: "/reports", target: '[data-tour="reports"]', title: "Анализ", text: "Отчёты помогают увидеть структуру доходов и расходов. Теперь можно начать вести учёт." },
];

function rectFor(selector) {
  const element = document.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { top: Math.max(8, rect.top - 7), left: Math.max(8, rect.left - 7), width: rect.width + 14, height: rect.height + 14 };
}

function activeTarget(step) {
  return window.matchMedia("(max-width: 767px)").matches && step.mobileTarget ? step.mobileTarget : step.target;
}

export default function GuidedTour() {
  const { user, refresh } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState(null);
  const step = STEPS[stepIndex];

  const updateSpotlight = useMemo(() => () => setSpotlight(rectFor(activeTarget(step))), [step]);
  useEffect(() => {
    if (user && !user.onboarding_completed) setActive(true);
  }, [user]);
  useEffect(() => {
    const start = () => { setStepIndex(0); setActive(true); };
    window.addEventListener(START_GUIDED_TOUR_EVENT, start);
    return () => window.removeEventListener(START_GUIDED_TOUR_EVENT, start);
  }, []);
  useLayoutEffect(() => {
    if (!active) return undefined;
    const timer = window.setTimeout(updateSpotlight, 90);
    window.addEventListener("resize", updateSpotlight);
    window.addEventListener("scroll", updateSpotlight, true);
    return () => { window.clearTimeout(timer); window.removeEventListener("resize", updateSpotlight); window.removeEventListener("scroll", updateSpotlight, true); };
  }, [active, location.pathname, updateSpotlight]);

  if (!active || !user) return null;
  const finish = async () => {
    setActive(false);
    try { await api.put("/api/me/", { onboarding_completed: true }); await refresh(); } catch { /* Tour stays dismissed locally even during a temporary network issue. */ }
  };
  const advance = () => {
    if (stepIndex === STEPS.length - 1) { finish(); return; }
    const next = STEPS[stepIndex + 1];
    setStepIndex(index => index + 1);
    if (location.pathname !== next.path) navigate(next.path);
  };
  const previous = () => {
    if (stepIndex === 0) return;
    const next = STEPS[stepIndex - 1];
    setStepIndex(index => index - 1);
    if (location.pathname !== next.path) navigate(next.path);
  };
  return <div className="guided-tour" role="dialog" aria-modal="true" aria-label="Знакомство с CaseMoney">
    {spotlight && <div className="guided-tour-spotlight" style={spotlight} />}
    <div className="guided-tour-card">
      <div className="guided-tour-progress">Шаг {stepIndex + 1} из {STEPS.length}</div>
      <h2>{step.title}</h2><p>{step.text}</p>
      <div className="guided-tour-actions">
        <button type="button" className="btn-link" onClick={finish}>Пропустить</button>
        {stepIndex > 0 && <button type="button" className="btn-secondary" onClick={previous}>Назад</button>}
        <button type="button" onClick={advance}>{stepIndex === STEPS.length - 1 ? "Готово" : "Далее"}</button>
      </div>
    </div>
  </div>;
}
