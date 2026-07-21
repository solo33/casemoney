import { useEffect, useState } from "react";
import PwaInstallLink from "./PwaInstallLink";

const DISMISSED_AT_KEY = "casemoney:pwa-prompt-dismissed-at";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function recentlyDismissed() {
  const value = Number(localStorage.getItem(DISMISSED_AT_KEY));
  return Number.isFinite(value) && Date.now() - value < DISMISS_FOR_MS;
}

export default function MobilePwaInstallPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return undefined;
    const timer = window.setTimeout(() => setVisible(true), 1200);
    const installed = () => setVisible(false);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    setVisible(false);
  };

  return (
    <aside className="mobile-pwa-prompt" aria-label="Установка приложения CaseMoney">
      <img src="/icon.svg" width="34" height="34" alt="" />
      <div className="mobile-pwa-prompt-copy">
        <strong>CaseMoney на телефоне</strong>
        <small>Быстрый запуск с главного экрана</small>
      </div>
      <PwaInstallLink className="mobile-pwa-prompt-install" />
      <button
        type="button"
        className="mobile-pwa-prompt-close"
        onClick={dismiss}
        aria-label="Закрыть предложение установки"
      >
        ×
      </button>
    </aside>
  );
}
