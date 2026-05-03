const CACHE = 'bgm-v6';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];
const DATA_CACHE = 'bgm-data-v1';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== DATA_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      // 新バージョン有効化後、全クライアントに自動リロードを指示
      .then(() => self.clients.matchAll({ includeUncontrolled: true, type: 'window' }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 音源・画像はR2から直接（キャッシュしない）
  if (url.hostname.includes('r2.cloudflarestorage') || url.pathname.match(/\.(mp3|jpg|jpeg|webp)$/)) {
    return;
  }

  // index.html はネットワーク優先 → 常に最新を取得、失敗時のみキャッシュ
  if (url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // /data/*.json はネットワーク優先、失敗時にキャッシュ
  if (url.pathname.startsWith('/data/')) {
    e.respondWith(
      caches.open(DATA_CACHE).then(cache =>
        fetch(e.request)
          .then(res => { cache.put(e.request, res.clone()); return res; })
          .catch(() => cache.match(e.request))
      )
    );
    return;
  }

  // その他のアセット（icons・manifest等）はキャッシュ優先
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      }
      return res;
    }))
  );
});
