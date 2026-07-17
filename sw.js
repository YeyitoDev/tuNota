/* tuNota — Service Worker: la app funciona sin conexión y es instalable en el escritorio/móvil.
   Estrategia network-first para archivos propios (recibes lo último si hay red, y la copia
   cacheada si no la hay). NO tocamos /api/* ni CDNs/servicios externos (dinámicos/sensibles). */
'use strict';
var CACHE = 'tunota-v11';
var SHELL = [
  './', './index.html', './styles.css', './note.html', './note.js', './manifest.json', './legal.html',
  './public/leaf.svg', './public/app-icon.svg', './public/icon-192.png', './public/icon-512.png',
  './public/fonts/fonts.css',
  './js/01-storage.js', './js/02-state.js', './js/03-dom.js', './js/04-sidebar-theme-ai.js',
  './js/05-topbar-canvas.js', './js/06-markdown-mermaid.js', './js/07-media.js', './js/08-text-exec.js',
  './js/09-interactions.js', './js/10-sync-panels.js', './js/11-features.js', './js/12-boot.js',
  './js/13-templates.js', './js/14-search.js', './js/15-tour.js', './js/16-sync.js', './js/17-guia.js',
  './js/18-control.js',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL).catch(function () {}); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  // Solo gestionamos archivos del propio origen y fuera de /api/ (los datos/proxies van a la red).
  if (url.origin !== self.location.origin || url.pathname.indexOf('/api/') === 0) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (cached) { return cached || caches.match('./index.html'); });
    })
  );
});
