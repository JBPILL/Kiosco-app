// Service Worker para KioskoPOS
// Estrategia: Cache-First para assets estáticos, Network-First para API

const CACHE_NAME = 'kioskopos-v1'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
]

// Instalación: cachear assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// Activación: limpiar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    })
  )
  self.clients.claim()
})

// Fetch: Network-first para API, Cache-first para assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Requests a Supabase: siempre red (no cachear datos)
  if (url.hostname.includes('supabase')) {
    return
  }

  // Assets estáticos: cache first, fallback a red
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request).then((response) => {
        // Solo cachear respuestas válidas
        if (response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone)
          })
        }
        return response
      }).catch(() => {
        // Offline: devolver la página principal para que React Router maneje la ruta
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html')
        }
      })
    })
  )
})
