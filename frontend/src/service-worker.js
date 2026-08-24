/* Custom PWA worker: keeps existing offline behaviour and handles web-push. */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();

registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api/] }));
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "casemoney-images",
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", event => {
  let payload = { title: "CaseMoney", body: "Новое уведомление", url: "/home" };
  try { payload = { ...payload, ...event.data?.json() }; } catch { /* empty/invalid payload */ }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-96.png",
    tag: `casemoney-${payload.url}`,
    data: { url: payload.url || "/home" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/home", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
    const client = windows.find(item => item.url.startsWith(self.location.origin));
    return client ? client.focus().then(() => client.navigate(url)) : self.clients.openWindow(url);
  }));
});
