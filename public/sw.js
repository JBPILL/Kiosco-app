// Auto-destrucción del Service Worker en desarrollo local para limpiar cachés obsoletos
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)))
    }).then(() => {
      return self.registration.unregister()
    })
  )
  self.clients.claim()
})

// Pasar todo directamente a la red sin interceptar
self.addEventListener('fetch', () => {
  return
})
