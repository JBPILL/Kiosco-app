import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './stores/fontSizeStore'
import App from './App'

// ── Pantalla completa automática al iniciar ──────────────────────────────────
// Los navegadores no permiten requestFullscreen sin un gesto del usuario.
// Usamos un listener de "una vez" en el primer clic/toque para entrar en
// pantalla completa automáticamente al inicio de la sesión.
function intentarPantallaCompleta() {
  const el = document.documentElement
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
      // Ignorar si el navegador o el sistema lo bloquea
    })
  }
}

// Si ya está disponible (PWA instalada en desktop), intentar de inmediato
if (document.fullscreenEnabled) {
  // En el primer clic/toque del usuario entramos a pantalla completa
  const activarPantallaCompleta = () => {
    intentarPantallaCompleta()
    document.removeEventListener('click', activarPantallaCompleta)
    document.removeEventListener('touchstart', activarPantallaCompleta)
  }
  document.addEventListener('click', activarPantallaCompleta, { once: true })
  document.addEventListener('touchstart', activarPantallaCompleta, { once: true })
}

// ── Recuperación ante nueva versión desplegada (evita errores MIME/chunk obsoleto) ──
window.addEventListener('vite:preloadError', () => {
  const key = 'kiosko_vite_preload_reload'
  if (sessionStorage.getItem(key) !== 'true') {
    sessionStorage.setItem(key, 'true')
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
