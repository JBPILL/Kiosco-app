import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './Button'
import { useCartStore } from '../../stores/cartStore'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  esErrorDeVersion: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    esErrorDeVersion: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    const msg = error?.message || ''
    const esErrorDeVersion =
      msg.includes('text/html') ||
      msg.includes('MIME type') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      error?.name === 'ChunkLoadError'

    return { hasError: true, error, esErrorDeVersion }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturó un error no controlado:', error, errorInfo)

  }

  private handleRecargar = () => {
    const carrito = useCartStore.getState()
    if ((carrito.items.length > 0 || carrito.tabs.some(tab => tab.items.length > 0))
      && !window.confirm('Hay tickets en preparación. Recargar descartará esos borradores. Volvé al punto de venta y pausá los tickets antes de actualizar. ¿Recargar de todos modos?')) return
    window.location.reload()
  }

  private handleIrACaja = () => {
    // Reiniciar React sin recargar conserva stores y tickets en memoria.
    window.history.replaceState(null, '', '/')
    this.setState({ hasError: false, error: null, esErrorDeVersion: false })
  }

  public render() {
    if (this.state.hasError) {
      const { esErrorDeVersion } = this.state

      return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-2xl p-6 sm:p-8 text-center shadow-xl space-y-4">
            <div className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center font-bold text-lg border ${
              esErrorDeVersion
                ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
            }`}>
              {esErrorDeVersion ? '↻' : '!'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-100">
                {esErrorDeVersion ? 'Actualización del sistema disponible' : 'Inconveniente visual detectado'}
              </h2>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                {esErrorDeVersion
                  ? 'No se pudo cargar un módulo. Puede deberse a una actualización o a la conexión. Volvé al punto de venta y pausá los tickets antes de actualizar.'
                  : 'No se pudo mostrar esta pantalla. Volvé al punto de venta para revisar tus tickets antes de recargar.'}
              </p>
            </div>
            {this.state.error && !esErrorDeVersion && (
              <details className="text-left text-[11px] bg-gray-900/90 p-3 rounded-xl border border-gray-700/80 text-gray-400 font-mono overflow-auto max-h-36">
                <summary className="cursor-pointer text-gray-300 font-sans text-xs font-medium mb-1 select-none">
                  Detalles técnicos del incidente
                </summary>
                <p className="text-red-400 font-bold">{this.state.error.name}: {this.state.error.message}</p>
                {this.state.error.stack && (
                  <pre className="mt-1 text-[10px] text-gray-500 whitespace-pre-wrap">{this.state.error.stack.slice(0, 400)}</pre>
                )}
              </details>
            )}
            <div className="pt-2 flex flex-col gap-2">
              <Button variant="primary" size="sm" onClick={this.handleRecargar} className="w-full">
                {esErrorDeVersion ? 'Actualizar a la nueva versión' : 'Recargar pantalla'}
              </Button>
              <Button variant="secondary" size="sm" onClick={this.handleIrACaja} className="w-full">
                Volver al punto de venta
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
