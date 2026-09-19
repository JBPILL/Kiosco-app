import { useEffect } from 'react'
import { Toaster, ToastBar, useToasterStore, toast } from 'react-hot-toast'
import { useThemeStore } from '../../stores/themeStore'

const MAX_TOASTS = 3

export function AppToaster() {
  const { tema } = useThemeStore()
  const { toasts } = useToasterStore()

  useEffect(() => {
    // 1. Filtrar notificaciones actualmente visibles
    const visibles = toasts.filter((t) => t.visible)

    // 2. Descartar duplicados exactos (sobreescribir el anterior quedándose con el más reciente)
    const seenMessages = new Set<string>()
    visibles.forEach((t) => {
      const msg = typeof t.message === 'function' ? '' : String(t.message || '')
      if (msg) {
        if (seenMessages.has(msg)) {
          toast.dismiss(t.id)
        } else {
          seenMessages.add(msg)
        }
      }
    })

    // 3. Limitar a un máximo estricto de 3 notificaciones simultáneas (sobreescribe las más viejas)
    if (visibles.length > MAX_TOASTS) {
      visibles.slice(MAX_TOASTS).forEach((t) => {
        toast.dismiss(t.id)
      })
    }

    // 4. Limpieza de toasts inactivos que ya terminaron su ciclo
    toasts
      .filter((t) => !t.visible)
      .slice(MAX_TOASTS)
      .forEach((t) => {
        toast.remove(t.id)
      })
  }, [toasts])

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '14px',
          background: tema === 'dark' ? '#1f2937' : '#fff',
          color: tema === 'dark' ? '#f3f4f6' : '#111827',
          border: tema === 'dark' ? '1px solid #374151' : '1px solid #e5e7eb',
          boxShadow:
            tema === 'dark'
              ? '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)'
              : '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff',
          },
          duration: 4500,
        },
      }}
    >
      {(t) => (
        <ToastBar toast={t} style={{ ...t.style, cursor: 'pointer' }}>
          {({ icon, message }) => (
            <div
              className="flex items-center gap-2 select-none w-full"
              onClick={() => toast.dismiss(t.id)}
              title="Hacé clic para cerrar"
            >
              {icon}
              <div className="flex-1">{message}</div>
            </div>
          )}
        </ToastBar>
      )}
    </Toaster>
  )
}


