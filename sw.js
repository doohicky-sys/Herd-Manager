const CACHE = "herd-v37";
const SHELL = ["./", "./index.html", "./style.css?v=37", "./manifest.webmanifest", "./js/01-core.js?v=37", "./js/02-photos.js?v=37", "./js/03-storage.js?v=37", "./js/04-family.js?v=37", "./js/05-bulk.js?v=37", "./js/06-features.js?v=37", "./js/07-dashboard.js?v=37", "./js/08-tools.js?v=37", "./js/09-render.js?v=37", "./js/10-profile.js?v=37", "./js/11-app.js?v=37", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-180.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Supabase/ImgBB pass straight through
  if (e.request.mode === "navigate") {
    // Network-first for the page itself, so new deploys appear immediately
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put("./index.html", copy));
      return r;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  // The app's own JS/CSS is network-first: a stale copy means the user runs
  // yesterday's code, which is exactly the bug this replaced. Cache stays as
  // the offline fallback. Everything else keeps stale-while-revalidate.
  const isAppCode = /\.(js|css)(\?|$)/.test(url.pathname + url.search);
  if (isAppCode) {
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => {
    const refresh = fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => hit);
    return hit || refresh;
  }));
});
