const CACHE = "herd-v45.2";
const SHELL = ["./", "./index.html", "./style.css?v=45.2", "./manifest.webmanifest?v=45.2", "./js/01-core.js?v=45.2", "./js/02-photos.js?v=45.2", "./js/03-storage.js?v=45.2", "./js/04-family.js?v=45.2", "./js/05-bulk.js?v=45.2", "./js/06-features.js?v=45.2", "./js/12-pairings.js?v=45.2", "./js/13-health.js?v=45.2", "./js/14-locations.js?v=45.2", "./js/07-dashboard.js?v=45.2", "./js/08-tools.js?v=45.2", "./js/09-render.js?v=45.2", "./js/10-profile.js?v=45.2", "./js/11-app.js?v=45.2", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-180.png", "./fonts/Fraunces-Semibold.woff2", "./fonts/Fraunces-Bold.woff2", "./fonts/Fraunces-Extrabold.woff2", "./fonts/Inter-Regular.woff2", "./fonts/Inter-Semibold.woff2", "./fonts/Inter-Bold.woff2"];
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
  // The app's own JS/CSS/manifest are network-first: a stale copy here is
  // exactly how the mint-green splash-colour bug shipped and then lingered
  // even after the fix was deployed — the manifest previously fell through
  // to the cache-first path below with no version-busting query string, so
  // a browser that had already cached the old colours had no signal to ever
  // refetch it. Cache stays as the offline fallback only.
  const isAppCode = /\.(js|css)(\?|$)/.test(url.pathname + url.search) || url.pathname.endsWith("manifest.webmanifest");
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
