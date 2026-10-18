/* global self, caches, fetch, Request, Response, URL */
/**
 * AKSHAR service worker. Caches ONLY the app's static files (code, styles,
 * fonts, icons, pdf.js data) so the app opens even when the local server is
 * stopped. It never touches /api/: notes, books, sessions and every other
 * piece of user data go straight between the page and the server, so nothing
 * of one user can be served to another from this cache.
 *
 * The version and file list below are filled in at build time (vite.config.ts).
 */
const VERSION = '__VERSION__';
const PRECACHE = /* __PRECACHE__ */ [];
const CACHE = `akshar-static-${VERSION}`;
const STATIC = /^\/(assets|pdfjs|icons)\//;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('akshar-static-') && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function remember(request, response) {
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    void caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Fresh page when the server is up; the cached app shell when it isn't.
    event.respondWith(
      fetch(request)
        .then((response) => remember(new Request('/index.html'), response))
        .catch(() => caches.match('/index.html').then((hit) => hit || Response.error())),
    );
    return;
  }

  if (STATIC.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    // Hashed or versioned files: the cache is always right once it has them.
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((r) => remember(request, r))),
    );
  }
});
