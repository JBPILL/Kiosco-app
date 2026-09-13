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
import { ConfigPage } from './pages/ConfigPage'
import { CajaPage } from './pages/CajaPage'
import { ClientesPage } from './pages/ClientesPage'

interface RutaProtegidaProps {
  rolesPermitidos: ('DUEÑO' | 'CAJERO' | 'VISOR')[]
  children: React.ReactNode
}

function RutaProtegida({ rolesPermitidos, children }: RutaProtegidaProps) {
  const { usuario } = useAuthStore()
  if (!usuario || !rolesPermitidos.includes(usuario.rol)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
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
          <div className="text-2xl font-bold text-indigo-600 mb-4">KioskoPOS</div>
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
            {/* Rutas compartidas (Dueño y Cajero) */}
            <Route path="/" element={<POSPage />} />
            <Route path="/caja" element={<CajaPage />} />
            <Route path="/clientes" element={<ClientesPage />} />

            {/* Rutas exclusivas para Dueño */}
            <Route
              path="/catalogo"
              element={
                <RutaProtegida rolesPermitidos={['DUEÑO']}>
                  <CatalogoPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/stock"
              element={
                <RutaProtegida rolesPermitidos={['DUEÑO']}>
                  <StockPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/config"
              element={
                <RutaProtegida rolesPermitidos={['DUEÑO']}>
                  <ConfigPage />
                </RutaProtegida>
              }
            />

            {/* Rutas para Dueño y Visor */}
            <Route
              path="/reportes"
              element={
                <RutaProtegida rolesPermitidos={['DUEÑO', 'VISOR']}>
                  <ReportesPage />
                </RutaProtegida>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  )
}

export default App
