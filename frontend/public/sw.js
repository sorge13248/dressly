// Dressly PWA Service Worker
const VERSION = '1.6.0';
const CACHE_NAME = `dressly-cache-v${VERSION}`;

// Static resources to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/logo.webp',
  '/icons/apple-touch-icon.png',
  '/icons/apple-touch-icon-180x180.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png',
  '/icons/icon-maskable-512x512.png',
  '/icons/favicon-32x32.png',
  '/icons/favicon-16x16.png'
];

// Install event: Precache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache partial error:', err);
      });
    })
  );
});

// Activate event: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Listen for messages from the frontend application
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event: Network-first for navigation, Stale-While-Revalidate for static assets, Network-only for API
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Do not intercept API requests or Auth endpoints:
  // Data is stored in IndexedDB and handled by SyncService
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/oauth2') || url.pathname.startsWith('/auth')) {
    return;
  }

  // Do not intercept dev server HMR / WebSocket requests or Vite internal endpoints
  if (
    url.pathname.includes('/@vite') ||
    url.pathname.includes('/ng-cli-ws') ||
    url.pathname.includes('/@fs') ||
    url.pathname.includes('/@id') ||
    url.pathname.includes('/sockjs-node') ||
    request.headers.get('Upgrade') === 'websocket'
  ) {
    return;
  }

  // Handle SPA navigation requests (mode: navigate)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        // If offline, serve the cached SPA index.html
        return caches.match('/index.html').then((cachedResponse) => {
          return cachedResponse || new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
    );
    return;
  }

  // Handle static assets (JS, CSS, images, fonts, webmanifest)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Network failed; if we don't have cachedResponse, return error
        return cachedResponse;
      });

      // Stale-While-Revalidate: Return cached response immediately if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});
