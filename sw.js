// SYNAPSE — service worker : app installable et consultable hors ligne.
// Incrémente VERSION pour forcer le renouvellement de tous les caches.
const VERSION = 'v5';
const SHELL = `synapse-shell-${VERSION}`;
const DATA = `synapse-data-${VERSION}`;
const IMAGES = `synapse-img-${VERSION}`;
const LIBS = `synapse-libs-${VERSION}`;
const MAX_IMAGES = 300;
const MAX_DATA = 200;

const SHELL_FILES = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/bg.js',
  './js/components.js',
  './js/modal.js',
  './js/store.js',
  './js/tmdb.js',
  './js/util.js',
  './js/views.js',
  './js/pwa.js',
  './icons/icon-192.png',
  './icons/favicon-32.png',
  './icons/favicon-64.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('synapse-') && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Réponse du cache tout de suite, mise à jour en arrière-plan (fichiers du site).
async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request, { ignoreSearch: true });
  const network = fetch(event.request)
    .then((res) => {
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || Response.error();
}

// Cache d'abord (ressources versionnées ou immuables : librairies, polices, affiches).
async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') {
    cache.put(request, res.clone()).then(() => max && trim(cacheName, max));
  }
  return res;
}

// Réseau d'abord, cache en secours (données films : fraîches en ligne, dispo hors ligne).
async function networkFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone()).then(() => trim(cacheName, max));
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navigation : l'app est une page unique (routage par hash).
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(async () => (await caches.match('./index.html', { ignoreSearch: true })) || Response.error())
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event, SHELL));
    return;
  }
  // Relais TMDB (Edge Function Supabase)
  if (url.pathname.endsWith('/functions/v1/tmdb') || url.hostname === 'api.themoviedb.org') {
    event.respondWith(networkFirst(req, DATA, MAX_DATA));
    return;
  }
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(cacheFirst(req, IMAGES, MAX_IMAGES));
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, LIBS, 0));
    return;
  }
  // Tout le reste (Supabase auth / base de données, YouTube…) : réseau direct, jamais mis en cache.
});
