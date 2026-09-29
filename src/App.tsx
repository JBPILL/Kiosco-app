import { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { LoginScreen } from './components/auth/LoginScreen'
import { MainLayout } from './components/layout/MainLayout'
import { AppToaster } from './components/ui/Toast'
import { AlPasoLogo } from './components/ui/AlPasoLogo'
import { POSPage } from './pages/POSPage'
import { CajaPage } from './pages/CajaPage'
import { usePwaStore } from './stores/pwaStore'
import { SingleInstanceGuard } from './components/ui/SingleInstanceGuard'
import { ErrorBoundary } from './components/ui/ErrorBoundary'

// Carga diferida (Code Splitting) para módulos secundarios y administrativos
const CatalogoPage = lazy(() => import('./pages/CatalogoPage').then((m) => ({ default: m.CatalogoPage })))
const PromocionesPage = lazy(() => import('./pages/PromocionesPage').then((m) => ({ default: m.PromocionesPage })))
const ReportesPage = lazy(() => import('./pages/ReportesPage').then((m) => ({ default: m.ReportesPage })))
const StockPage = lazy(() => import('./pages/StockPage').then((m) => ({ default: m.StockPage })))
const ProveedoresPage = lazy(() => import('./pages/ProveedoresPage').then((m) => ({ default: m.ProveedoresPage })))
const ConfigPage = lazy(() => import('./pages/ConfigPage').then((m) => ({ default: m.ConfigPage })))
const ClientesPage = lazy(() => import('./pages/ClientesPage').then((m) => ({ default: m.ClientesPage })))
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage').then((m) => ({ default: m.SuperAdminPage })))
const SoportePage = lazy(() => import('./pages/SoportePage').then((m) => ({ default: m.SoportePage })))

function PageLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin h-8 w-8 border-3 border-indigo-600 border-t-transparent rounded-full" />
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Cargando módulo...</span>
      </div>
    </div>
  )
}

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
    <SingleInstanceGuard>
      <ErrorBoundary>
        <BrowserRouter>
        <AppToaster />
        {!usuario ? (
          <Routes>
            <Route path="*" element={<LoginScreen />} />
          </Routes>
        ) : (
          <Suspense fallback={<PageLoadingFallback />}>
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
          </Suspense>
        )}
        </BrowserRouter>
      </ErrorBoundary>
    </SingleInstanceGuard>
  )
}

export default App
