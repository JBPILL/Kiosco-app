import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { LoginScreen } from './components/auth/LoginScreen'
import { MainLayout } from './components/layout/MainLayout'
import { AppToaster } from './components/ui/Toast'
import { POSPage } from './pages/POSPage'
import { CatalogoPage } from './pages/CatalogoPage'
import { ReportesPage } from './pages/ReportesPage'
import { StockPage } from './pages/StockPage'

// Páginas placeholder (se implementan después)
function ConfigPage() {
  return (
    <div className="text-center py-20">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">⚙️ Configuración</h2>
      <p className="text-gray-500">Módulo en desarrollo...</p>
    </div>
  )
}

function App() {
  const { usuario, cargando, cargarSesion } = useAuthStore()

  useEffect(() => {
    cargarSesion()
  }, [cargarSesion])

  // Pantalla de carga mientras se verifica la sesión
  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-4">🏪</div>
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-500 mt-4">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <AppToaster />
      {!usuario ? (
        <Routes>
          <Route path="*" element={<LoginScreen />} />
        </Routes>
      ) : (
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<POSPage />} />
            <Route path="/catalogo" element={<CatalogoPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/reportes" element={<ReportesPage />} />
            <Route path="/config" element={<ConfigPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  )
}

export default App
