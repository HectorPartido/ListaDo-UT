/* =============================================================================
   sw.js — service worker.

   Hace dos cosas:
     1. Guarda la app (HTML, CSS, JS, iconos) para que abra al instante y
        funcione sin conexión.
     2. NUNCA toca las llamadas a Supabase: los datos siempre van a la red, que
        para eso está la cola de js/sync.js.

   Al cambiar VERSION se descarta la copia anterior y se descarga todo de nuevo.
   ============================================================================= */

const VERSION = 'listado-v1-2026-09-13';

/* El armazón de la app. Si añades un archivo nuevo, ponlo aquí y sube VERSION. */
const ARMAZON = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/config.js',
  './js/utils.js',
  './js/icons.js',
  './js/importers.js',
  './js/api.js',
  './js/sync.js',
  './js/store.js',
  './js/ui.js',
  './js/modals.js',
  './js/auth-ui.js',
  './js/views/dashboard.js',
  './js/views/tasks.js',
  './js/views/calendar.js',
  './js/views/schedule.js',
  './js/views/subjects.js',
  './js/views/team.js',
  './js/views/stats.js',
  './js/views/group.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0'
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(VERSION).then(function (cache) {
      // addAll falla entero si un solo archivo falla: se piden de uno en uno.
      return Promise.all(ARMAZON.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function (err) {
          console.warn('[sw] no se pudo guardar', url, err);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys()
      .then(function (claves) {
        return Promise.all(claves
          .filter(function (k) { return k !== VERSION; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evento) {
  const peticion = evento.request;
  const url = new URL(peticion.url);

  // Datos y sesión: directos a la red, nunca a la caché.
  if (url.hostname.endsWith('.supabase.co') || peticion.method !== 'GET') return;

  // Navegación: primero la red (para ver los cambios), y si no hay, la copia.
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion).catch(function () {
        return caches.match('./index.html').then(function (r) {
          return r || caches.match('./');
        });
      })
    );
    return;
  }

  // Resto: se responde con la copia y se refresca por detrás.
  evento.respondWith(
    caches.match(peticion).then(function (guardada) {
      const enRed = fetch(peticion).then(function (respuesta) {
        if (respuesta && respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(VERSION).then(function (cache) { cache.put(peticion, copia); });
        }
        return respuesta;
      }).catch(function () { return guardada; });

      return guardada || enRed;
    })
  );
});
