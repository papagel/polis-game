/* POLIS service worker — offline play.
   Shell (index.html + icons): network-first with cache fallback, so a plain
   git-push deploy is picked up immediately when online but the game still
   boots with no network. Fonts: cache-first (they are effectively immutable).
   Analytics beacon: never intercepted. */
const CACHE = 'polis-v1';
const SHELL = ['./', './index.html', './favicon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // icons are nice-to-have; only './' + index.html are required for offline boot
      .then(c => c.addAll(SHELL.slice(0, 2)).then(() => Promise.allSettled(SHELL.slice(2).map(u => c.add(u)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const cachePut = (req, res) => {
  // opaque = no-cors cross-origin (font CSS); ok = normal 200s. Never cache errors.
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'static.cloudflareinsights.com') return;

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => cachePut(req, res)))
    );
    return;
  }

  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(req)
      .then(res => cachePut(req, res))
      .catch(() =>
        caches.match(req, { ignoreSearch: req.mode === 'navigate' })
          .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Promise.reject(new Error('offline, uncached')))))
  );
});
