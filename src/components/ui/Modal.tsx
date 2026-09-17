import { useEffect, useRef } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
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

export function Modal({ isOpen, onClose, title, children, size = 'md', zIndex = 'z-50' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

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

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 ${zIndex} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs transition-opacity`}
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        className={`bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full ${sizeStyles[size]} max-h-[90dvh] flex flex-col pb-[max(16px,env(safe-area-inset-bottom))] sm:pb-0 border-t sm:border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-150`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-all text-xl"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {/* Body */}
        <div className="px-5 sm:px-6 py-4 overflow-y-auto overscroll-contain flex-1 min-h-0 flex flex-col">
          {children}
        </div>
      </div>
    </div>
  )
}
