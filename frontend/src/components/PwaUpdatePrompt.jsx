import { useEffect, useState } from "react";

export default function PwaUpdatePrompt() {
  const [applyUpdate, setApplyUpdate] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const available = event => setApplyUpdate(() => event.detail?.update || null);
    window.addEventListener("casemoney:pwa-update-available", available);
    if (typeof window.__casemoneyPwaUpdate === "function") {
      setApplyUpdate(() => window.__casemoneyPwaUpdate);
    }
    return () => window.removeEventListener("casemoney:pwa-update-available", available);
  }, []);

  if (!applyUpdate) return null;

  const update = () => {
    if (!window.confirm("Приложение перезапустится. Если вы заполняете операцию, сначала сохраните её. Обновить сейчас?")) return;
    setUpdating(true);
    applyUpdate();
  };

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite">
      <div>
        <strong>Доступно обновление</strong>
        <span>Новая версия будет установлена без очистки ваших данных.</span>
      </div>
      <button type="button" onClick={update} disabled={updating}>
        {updating ? "Обновляем…" : "Обновить"}
      </button>
      <button type="button" className="pwa-update-later" onClick={() => setApplyUpdate(null)} disabled={updating} aria-label="Напомнить позже">×</button>
    </aside>
  );
}
