import { useEffect, useState } from "react";

export function BrandProgress({ label = "Обновляем данные…", size = 42, style = {} }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        color: "#7a8590", fontSize: 13,
        ...style,
      }}
    >
      <span
        className="cm-brand-fill"
        aria-hidden="true"
        style={{ "--cm-brand-size": `${size}px` }}
      >
        C
      </span>
      <span>{label}</span>
    </div>
  );
}

export function GlobalNetworkProgress() {
  const [activeRequests, setActiveRequests] = useState(
    () => window.__casemoneyActiveRequests || 0,
  );
  const [visible, setVisible] = useState(false);
  const isBusy = activeRequests > 0;

  useEffect(() => {
    const update = event => setActiveRequests(event.detail?.activeRequests || 0);
    window.addEventListener("casemoney:network-progress", update);
    return () => window.removeEventListener("casemoney:network-progress", update);
  }, []);

  useEffect(() => {
    if (!isBusy) {
      setVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setVisible(true), 2000);
    return () => window.clearTimeout(timer);
  }, [isBusy]);

  if (!visible || !isBusy) return null;

  return (
    <div className="cm-global-progress">
      <BrandProgress
        label="CaseMoney обновляет данные…"
        size={52}
        style={{ color: "#1b2531", fontWeight: 600 }}
      />
    </div>
  );
}
