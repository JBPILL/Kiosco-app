// Service Worker para AlPaso POS PWA
// Estrategia Network-First: Siempre intenta obtener la versión más reciente de la red.
// Si no hay conexión a internet, usa la copia local guardada en caché.

const CACHE_NAME = 'alpaso-pos-v27'
function isValidAssetResponse(request, response) {
  const path = new URL(request.url).pathname
  const type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase()
  if (request.destination === 'script' || /\.(?:m?js)$/.test(path)) {
    return ['text/javascript', 'application/javascript', 'application/x-javascript'].includes(type)
  }
  if (request.destination === 'style' || path.endsWith('.css')) return type === 'text/css'
  return true
}
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/favicon.png',
  '/alpaso-logo.png',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('alpaso-pos-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Ignorar métodos no GET y esquemas que no sean HTTP/HTTPS (extensiones, etc.)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return
  }

  // Peticiones a Supabase: ir siempre directamente a la red
  if (url.hostname.includes('supabase')) {
    return
  }

  // Network-First para assets y navegación
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && !isValidAssetResponse(event.request, response)) {
          return new Response('Recurso inválido. Actualizá la aplicación.', { status: 502, headers: { 'Cache-Control': 'no-store' } })
        }
        if (response.status === 200) {
          const clone = response.clone()
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {}))
        }
        return response
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached && isValidAssetResponse(event.request, cached)) return cached
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html')
          }
          return new Response('Sin conexión', { status: 503 })
        })
      })
  )
})
