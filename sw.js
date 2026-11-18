const CACHE = 'sully-shell-v3-touch-alerts';
const SHELL = ['./', './index.html', './style.css?rev=touch-alerts', './app.js?rev=touch-alerts', './core.js?rev=period-moods', './icons.js?rev=period-moods', './sky.js', './theme.js', './alerts.js', './cloud.js?rev=touch-alerts', './config.js', './icon.svg', './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('sully-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  if (!SHELL.some(p => new URL(p, self.registration.scope).href === e.request.url)) return;
  e.respondWith(fetch(e.request).then(response => {
    if (response.ok) { const copy = response.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy))); }
    return response;
  }).catch(() => caches.match(e.request)));
});
