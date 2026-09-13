const CACHE_NAME = 'scanner-cache-v14';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/pdf.js',
  './js/imaging.js',
  './js/perspective.js',
  './js/ocr.js',
  './js/vendor/jspdf.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/maskable-icon-512.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheResponse(request, response) {
  if (response && response.ok && response.type === 'basic') {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
  }
  return response;
}

function networkFirst(request, fallbackUrl = null) {
  return fetch(request)
    .then((response) => cacheResponse(request, response))
    .catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (fallbackUrl) return caches.match(fallbackUrl);
      throw new Error('Offline resource unavailable');
    });
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => cacheResponse(request, response));
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, './index.html'));
    return;
  }

  // Les fichiers applicatifs changent pendant le développement : réseau
  // d'abord évite de rester bloqué sur une ancienne version même si le
  // développeur oublie de modifier le nom du cache.
  const isAppSource =
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('/manifest.json') ||
    /\/js\/(app|db|pdf|imaging|perspective|ocr)\.js$/.test(url.pathname);

  if (isAppSource) {
    event.respondWith(networkFirst(event.request));
  } else {
    // Vendor, icônes et moteur OCR : cache d'abord, téléchargement à la demande.
    event.respondWith(cacheFirst(event.request));
  }
});
