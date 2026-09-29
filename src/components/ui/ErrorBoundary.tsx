import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './Button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturó un error no controlado:', error, errorInfo)
  }

  private handleRecargar = () => {
    window.location.reload()
  }

  private handleIrACaja = () => {
    window.location.href = '/caja'
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-2xl p-6 sm:p-8 text-center shadow-xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center font-bold text-lg border border-amber-500/40">
              !
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-100">Inconveniente visual detectado</h2>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Tus datos de ventas, turnos de caja y operaciones se encuentran seguros y guardados.
              </p>
            </div>
            {this.state.error && (
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
                Recargar pantalla
              </Button>
              <Button variant="secondary" size="sm" onClick={this.handleIrACaja} className="w-full">
                Ir al panel de Caja
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
