const CACHE_NAME = "tanaw-v2";

const ASSETS = [
  "/",
  "/index.html",
  "/feed.html",
  "/more.html",
  "/style.css",
  "/app.js",
  "/feed.js",
  "/more.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});

/* PUSH NOTIFICATION HANDLER */
self.addEventListener("message", event => {
  const alert = event.data;
  if (!alert) return;

  self.registration.showNotification("🚨 Incident Alert", {
    body: `${alert.type} – ${alert.area}`,
    icon: "icon-192.png",
    vibrate: [200, 100, 200]
  });
});