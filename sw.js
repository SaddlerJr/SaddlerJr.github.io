// Service worker: makes the site installable and fully usable without internet.
// Every file the app needs is served from this site and stored in the cache on first visit.
// Bump CACHE when any of the files below change so clients pick up the new version.
const CACHE = 'sfi-v6';

// Required for the app to work offline — install fails (and retries later) if any is missing.
const CORE = [
  '/',
  '/manifest.json',
  '/vendor/tailwind.js',
  '/vendor/lucide.min.js',
  '/vendor/fonts/inter.css',
  '/vendor/fonts/inter-latin.woff2',
  '/vendor/fonts/inter-latin-ext.woff2',
  '/vendor/fonts/inter-cyrillic.woff2',
  '/vendor/fonts/inter-cyrillic-ext.woff2',
];

// Nice to have offline.
const OPTIONAL = [
  '/icons/launchericon-48x48.png',
  '/icons/launchericon-72x72.png',
  '/icons/launchericon-96x96.png',
  '/icons/launchericon-144x144.png',
  '/icons/launchericon-192x192.png',
  '/icons/launchericon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
    await Promise.all(OPTIONAL.map((u) => c.add(u).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const putInCache = async (req, res) => {
  if (res && res.ok) {
    const c = await caches.open(CACHE);
    await c.put(req, res.clone());
  }
  return res;
};

// Fetch with a timeout so a weak/flaky connection doesn't leave the app hanging.
const fetchWithTimeout = (req, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page itself: try the network briefly for fresh content, otherwise use the cached copy.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetchWithTimeout(req, 3000);
        if (res.ok) await putInCache('/', res);
        return res;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Static files: answer instantly from cache, refresh in the background.
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => putInCache(req, res)).catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) || Response.error();
  })());
});
