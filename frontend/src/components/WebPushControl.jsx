import { useEffect, useState } from "react";
import api from "../api/client";

function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

export default function WebPushControl({ flash }) {
  const [state, setState] = useState("loading");
  const [subscription, setSubscription] = useState(null);
  const [busy, setBusy] = useState(false);

  const inspect = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      setSubscription(current);
      setState(current ? "enabled" : "off");
    } catch {
      setState("unsupported");
    }
  };

  useEffect(() => { inspect(); }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const config = await api.get("/api/notifications/push/config", { skipGlobalProgress: true });
      if (!config.data.enabled || !config.data.public_key) {
        flash("Web-push пока не настроены на сервере", true);
        setState("unconfigured");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("blocked");
        flash("Разрешение на уведомления не выдано", true);
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(config.data.public_key),
      });
      const json = current.toJSON();
      await api.post("/api/notifications/push/subscribe", {
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
      }, { skipGlobalProgress: true });
      setSubscription(current);
      setState("enabled");
      flash("Push-уведомления включены для этого устройства");
    } catch (error) {
      flash(error.response?.data?.detail || "Не удалось включить push-уведомления", true);
      await inspect();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!subscription) return;
    setBusy(true);
    try {
      await api.delete("/api/notifications/push/subscribe", {
        data: { endpoint: subscription.endpoint },
        skipGlobalProgress: true,
      });
      await subscription.unsubscribe();
      setSubscription(null);
      setState("off");
      flash("Push-уведомления выключены на этом устройстве");
    } catch (error) {
      flash(error.response?.data?.detail || "Не удалось выключить push-уведомления", true);
    } finally {
      setBusy(false);
    }
  };

  const details = {
    loading: "Проверяем поддержку браузера…",
    enabled: "Включены для этого устройства.",
    off: "Можно получать напоминания, даже когда CaseMoney закрыт.",
    blocked: "Браузер заблокировал уведомления. Разрешите их в настройках сайта и обновите страницу.",
    unsupported: "Этот браузер не поддерживает web-push.",
    unconfigured: "Сервер ещё не настроен для безопасной отправки web-push.",
  };
  const canEnable = state === "off" || state === "unconfigured";

  return <div className="web-push-control">
    <div>
      <b>Push на этом устройстве</b>
      <small>{details[state]}</small>
    </div>
    {state === "enabled" ? <button type="button" className="secondary" onClick={disable} disabled={busy}>Выключить</button>
      : canEnable ? <button type="button" onClick={enable} disabled={busy}>{busy ? "Подключаем…" : "Включить"}</button> : null}
  </div>;
}
