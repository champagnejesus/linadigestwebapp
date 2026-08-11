const CACHE = "linadigest-shell-v2";
const SHELL = ["/manifest.webmanifest", "/linadigest-logo.png", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    event.request.url.includes("/api/") ||
    event.request.mode === "navigate"
  ) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
