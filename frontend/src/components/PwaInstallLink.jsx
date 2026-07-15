import { useEffect, useState } from "react";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

export default function PwaInstallLink({ style = {}, className = "" }) {
  const [installPrompt, setInstallPrompt] = useState(
    () => window.__casemoneyInstallPrompt || null
  );
  const [installed, setInstalled] = useState(isStandalone);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const available = () => setInstallPrompt(window.__casemoneyInstallPrompt || null);
    const completed = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowHelp(false);
    };
    window.addEventListener("casemoney:pwa-install-available", available);
    window.addEventListener("appinstalled", completed);
    return () => {
      window.removeEventListener("casemoney:pwa-install-available", available);
      window.removeEventListener("appinstalled", completed);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!installPrompt) {
      setShowHelp(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    window.__casemoneyInstallPrompt = null;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setInstalled(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={install}
        className={className}
        style={{
          border: "none", background: "transparent", color: "inherit",
          cursor: "pointer", ...style,
        }}
      >
        Установить приложение
      </button>

      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(15, 30, 45, 0.48)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 18,
          }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{
              width: "100%", maxWidth: 430,
              background: "#fffdf7", color: "#1b2531",
              border: "1px solid #e4ddcd", borderRadius: 12,
              boxShadow: "0 20px 44px -16px rgba(15,30,45,0.45)",
              padding: 22,
            }}
          >
            <h3 style={{ margin: "0 0 12px", color: "#173a54" }}>
              Установить CaseMoney
            </h3>
            {isIos() ? (
              <ol style={{ margin: "0 0 18px", paddingLeft: 22, lineHeight: 1.7 }}>
                <li>Нажмите кнопку «Поделиться» в Safari.</li>
                <li>Выберите «На экран „Домой“».</li>
                <li>Нажмите «Добавить».</li>
              </ol>
            ) : (
              <p style={{ margin: "0 0 18px", lineHeight: 1.6 }}>
                Откройте меню браузера и выберите «Установить приложение» или
                «Добавить на главный экран». Лучше использовать Chrome или Edge.
              </p>
            )}
            <button type="button" onClick={() => setShowHelp(false)} style={{ width: "100%" }}>
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  );
}
