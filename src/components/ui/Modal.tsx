import { useState, useEffect, useRef } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  zIndex?: string
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-4xl',
  '3xl': 'max-w-5xl',
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md', zIndex = 'z-50' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const mouseDownOnOverlayRef = useRef(false)
  const lastBackdropClickTimeRef = useRef(0)
  const [mostrarAviso, setMostrarAviso] = useState(false)
  const avisoTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) {
      setMostrarAviso(false)
      lastBackdropClickTimeRef.current = 0
      mouseDownOnOverlayRef.current = false
      if (avisoTimerRef.current) clearTimeout(avisoTimerRef.current)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    mouseDownOnOverlayRef.current = e.target === overlayRef.current
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    // Si mousedown no ocurrió directamente en el overlay (ej: arrastró seleccionando texto desde un input y soltó afuera), ignorar
    if (!mouseDownOnOverlayRef.current || e.target !== overlayRef.current) {
      mouseDownOnOverlayRef.current = false
      return
    }
    mouseDownOnOverlayRef.current = false

    const now = Date.now()
    const diff = now - lastBackdropClickTimeRef.current

    if (diff < 1500) {
      // Segundo clic o doble clic afuera en menos de 1.5s -> Cerrar modal
      lastBackdropClickTimeRef.current = 0
      setMostrarAviso(false)
      if (avisoTimerRef.current) clearTimeout(avisoTimerRef.current)
      onClose()
    } else {
      // Primer clic afuera -> Registrar y mostrar aviso sutil
      lastBackdropClickTimeRef.current = now
      setMostrarAviso(true)
      if (avisoTimerRef.current) clearTimeout(avisoTimerRef.current)
      avisoTimerRef.current = setTimeout(() => {
        setMostrarAviso(false)
      }, 1500)
    }
  }

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 ${zIndex} flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 dark:bg-black/75 backdrop-blur-xs sm:backdrop-blur-sm transition-opacity animate-in fade-in duration-150`}
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        className={`modal-container bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full ${sizeStyles[size]} max-h-[min(94vh,calc(100dvh-1.5rem))] my-auto flex flex-col border border-slate-300 dark:border-gray-700 ring-1 ring-slate-900/15 dark:ring-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150`}
      >
        {/* Header con estilo de barra de ventana claramente delimitada */}
        <div className="modal-header flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-100/90 dark:bg-gray-800/95 border-b border-slate-200 dark:border-gray-700 flex-shrink-0">
          <h2 id="modal-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-gray-100 tracking-tight">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-slate-200/80 dark:hover:bg-gray-700 active:scale-95 transition-all text-base font-bold cursor-pointer"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 overflow-y-auto overscroll-contain flex-1 min-h-0 flex flex-col bg-white dark:bg-gray-800">
          {children}
        </div>

        {/* Footer (Fijado al fondo de la ventana para que las acciones nunca se recorten) */}
        {footer && (
          <div className="modal-footer px-4 sm:px-6 py-3 bg-slate-50/95 dark:bg-gray-800/95 border-t border-slate-200 dark:border-gray-700 flex-shrink-0 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>

      {/* Aviso sutil tras el primer clic afuera */}
      {mostrarAviso && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-3.5 py-1.5 rounded-full bg-slate-900/90 dark:bg-slate-100/95 text-white dark:text-slate-900 text-xs font-semibold shadow-xl border border-white/10 dark:border-black/10 backdrop-blur-xs flex items-center gap-1.5">
            <span>Hacé otro clic afuera para cerrar</span>
          </div>
        </div>
      )}
    </div>
  )
}
