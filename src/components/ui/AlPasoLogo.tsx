import React from 'react'

interface AlPasoLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  layout?: 'horizontal' | 'vertical'
  showText?: boolean
  className?: string
}

export const AlPasoLogo: React.FC<AlPasoLogoProps> = ({
  size = 'md',
  layout = 'horizontal',
  showText = true,
  className = '',
}) => {
  // Dimensiones del ícono
  const iconDimensions = {
    xs: 'w-6 h-6 rounded-md',
    sm: 'w-7 h-7 rounded-lg',
    md: 'w-9 h-9 rounded-xl',
    lg: 'w-14 h-14 rounded-2xl',
    xl: 'w-20 h-20 rounded-3xl',
  }[size]

  // Tamaños tipográficos
  const textStyles = {
    xs: 'text-sm',
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-3xl',
  }[size]

  const badgeStyles = {
    xs: 'text-[9px] px-1 py-0.2',
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-1.5 py-0.5',
    lg: 'text-sm px-2 py-0.5',
    xl: 'text-base px-2.5 py-1',
  }[size]

  const gapStyles = {
    xs: layout === 'vertical' ? 'gap-1.5' : 'gap-2',
    sm: layout === 'vertical' ? 'gap-2' : 'gap-2.5',
    md: layout === 'vertical' ? 'gap-2.5' : 'gap-3',
    lg: layout === 'vertical' ? 'gap-3' : 'gap-3.5',
    xl: layout === 'vertical' ? 'gap-4' : 'gap-4',
  }[size]

  return (
    <div
      className={`inline-flex items-center select-none ${
        layout === 'vertical' ? 'flex-col justify-center text-center' : 'flex-row'
      } ${gapStyles} ${className}`}
    >
      {/* Isotipo con squircle, sombra suave y borde sutil */}
      <div className="relative flex-shrink-0 group">
        <img
          src="/alpaso-logo.png"
          alt="AlPaso POS Logo"
          className={`${iconDimensions} object-cover shadow-sm border border-indigo-100/60 dark:border-indigo-900/50 bg-white dark:bg-gray-800 transition-transform duration-200 group-hover:scale-105`}
          onError={(e) => {
            // Fallback si por alguna razón la imagen no carga
            const target = e.currentTarget
            target.style.display = 'none'
          }}
        />
      </div>

      {/* Logotipo / Tipografía */}
      {showText && (
        <div className={`flex items-center tracking-tight leading-none ${layout === 'vertical' ? 'justify-center' : ''}`}>
          <span className={`font-black tracking-tight text-gray-900 dark:text-white ${textStyles}`}>
            AlPaso
          </span>
          <span
            className={`ml-1.5 font-black uppercase tracking-wider bg-gradient-to-r from-indigo-600 to-cyan-600 dark:from-indigo-400 dark:to-cyan-400 text-white rounded-md shadow-xs ${badgeStyles}`}
          >
            POS
          </span>
        </div>
      )}
    </div>
  )
}

export default AlPasoLogo
