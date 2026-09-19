import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { LoginScreen } from './components/auth/LoginScreen'
import { MainLayout } from './components/layout/MainLayout'
import { AppToaster } from './components/ui/Toast'
import { AlPasoLogo } from './components/ui/AlPasoLogo'
import { POSPage } from './pages/POSPage'
import { CatalogoPage } from './pages/CatalogoPage'
import { PromocionesPage } from './pages/PromocionesPage'
import { ReportesPage } from './pages/ReportesPage'
import { StockPage } from './pages/StockPage'
import { ProveedoresPage } from './pages/ProveedoresPage'
import { ConfigPage } from './pages/ConfigPage'
import { CajaPage } from './pages/CajaPage'
import { ClientesPage } from './pages/ClientesPage'
import { SuperAdminPage } from './pages/SuperAdminPage'
import { SoportePage } from './pages/SoportePage'
import { usePwaStore } from './stores/pwaStore'

interface RutaProtegidaProps {
  rolesPermitidos: ('DUEÑO' | 'CAJERO' | 'VISOR')[]
  children: React.ReactNode
}

function RutaProtegida({ rolesPermitidos, children }: RutaProtegidaProps) {
  const { usuario } = useAuthStore()
  if (!usuario) {
    return <Navigate to="/" replace />
  }
  // Si es superadmin sin kiosco asignado, su lugar de trabajo es el panel admin
  if (usuario.es_superadmin && !usuario.kiosco_id) {
    return <Navigate to="/admin" replace />
  }
  if (!rolesPermitidos.includes(usuario.rol)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function RutaSuperAdmin({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuthStore()
  if (!usuario || !usuario.es_superadmin) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function App() {
  const { usuario, cargando, cargarSesion } = useAuthStore()
  const initPwa = usePwaStore((state) => state.initPwa)

  useEffect(() => {
    cargarSesion()
    initPwa()
  }, [cargarSesion, initPwa])

  // Pantalla de carga mientras se verifica la sesión
  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center flex flex-col items-center">
          <AlPasoLogo size="lg" layout="vertical" />
          <div className="animate-spin h-7 w-7 border-3 border-indigo-600 border-t-transparent rounded-full mt-6" />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 font-medium">Iniciando sistema...</p>
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
            <Route
              path="/"
              element={
                usuario.es_superadmin && !usuario.kiosco_id
                  ? <Navigate to="/admin" replace />
                  : usuario.rol === 'VISOR'
                  ? <Navigate to="/reportes" replace />
                  : <POSPage />
              }
            />
            <Route
              path="/caja"
              element={
                usuario.es_superadmin && !usuario.kiosco_id
                  ? <Navigate to="/admin" replace />
                  : usuario.rol === 'VISOR'
                  ? <Navigate to="/reportes" replace />
                  : <CajaPage />
              }
            />
            <Route
              path="/clientes"
              element={
                usuario.es_superadmin && !usuario.kiosco_id
                  ? <Navigate to="/admin" replace />
                  : usuario.rol === 'VISOR'
                  ? <Navigate to="/reportes" replace />
                  : <ClientesPage />
              }
            />

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
              path="/promociones"
              element={
                <RutaProtegida rolesPermitidos={['DUEÑO']}>
                  <PromocionesPage />
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
              path="/proveedores"
              element={
                <RutaProtegida rolesPermitidos={['DUEÑO']}>
                  <ProveedoresPage />
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

            {/* Ruta de Soporte y Ayuda para todos los usuarios */}
            <Route
              path="/soporte"
              element={
                <RutaProtegida rolesPermitidos={['DUEÑO', 'CAJERO', 'VISOR']}>
                  <SoportePage />
                </RutaProtegida>
              }
            />

            {/* Ruta exclusiva para Super-Admin */}
            <Route
              path="/admin"
              element={
                <RutaSuperAdmin>
                  <SuperAdminPage />
                </RutaSuperAdmin>
              }
            />
          </Route>
          <Route
            path="*"
            element={
              <Navigate
                to={
                  usuario.es_superadmin && !usuario.kiosco_id
                    ? "/admin"
                    : usuario.rol === 'VISOR'
                    ? "/reportes"
                    : "/"
                }
                replace
              />
            }
          />
        </Routes>
      )}
    </BrowserRouter>
  )
}

export default App
