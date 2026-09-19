import React from 'react'
import { useFontSizeStore, FONT_SIZE_OPTIONS, type FontSizeLevel } from '../../stores/fontSizeStore'
import { useThemeStore } from '../../stores/themeStore'
import { Button } from '../ui/Button'
import toast from 'react-hot-toast'

export const AccessibilityConfigSection: React.FC = () => {
  const { fontSize, setFontSize, increaseFontSize, decreaseFontSize, resetFontSize } =
    useFontSizeStore()
  const { tema, toggleTema } = useThemeStore()

  const currentOption =
    FONT_SIZE_OPTIONS.find((opt) => opt.id === fontSize) || FONT_SIZE_OPTIONS[1]

  const isMin = fontSize === 'compacto'
  const isMax = fontSize === 'extra'

  const handleSelect = (level: FontSizeLevel) => {
    setFontSize(level)
    const opt = FONT_SIZE_OPTIONS.find((o) => o.id === level)
    toast.success(`Tamaño de letra: ${opt?.label} (${opt?.porcentaje})`, {
      id: 'font-size-toast',
      icon: '👁️',
    })
  }

  const handleAumentar = () => {
    if (isMax) return
    increaseFontSize()
    const currentIndex = FONT_SIZE_OPTIONS.findIndex((o) => o.id === fontSize)
    const next = FONT_SIZE_OPTIONS[currentIndex + 1]
    if (next) {
      toast.success(`Tamaño aumentado: ${next.label} (${next.porcentaje})`, {
        id: 'font-size-toast',
        icon: '🔍',
      })
    }
  }

  const handleDisminuir = () => {
    if (isMin) return
    decreaseFontSize()
    const currentIndex = FONT_SIZE_OPTIONS.findIndex((o) => o.id === fontSize)
    const prev = FONT_SIZE_OPTIONS[currentIndex - 1]
    if (prev) {
      toast.success(`Tamaño disminuido: ${prev.label} (${prev.porcentaje})`, {
        id: 'font-size-toast',
        icon: '🔎',
      })
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-xs">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 dark:border-gray-700 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              Accesibilidad y Tamaño de Letra
            </h2>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300">
              Visual
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Aumentá o disminuí el tamaño de las letras, precios y botones de todo el sistema para facilitar la lectura y el cobro en mostrador.
          </p>
        </div>

        {/* Botón de restablecer */}
        {fontSize !== 'normal' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              resetFontSize()
              toast.success('Tamaño de letra restablecido a Normal (100%)', {
                id: 'font-size-toast',
              })
            }}
            className="self-start sm:self-auto text-xs shrink-0"
          >
            Restablecer (100%)
          </Button>
        )}
      </div>

      {/* Control Rápido de Aumento / Disminución (Paso a Paso) */}
      <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
            Escala Actual
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-gray-900 dark:text-white">
              {currentOption.label}
            </span>
            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
              ({currentOption.porcentaje})
            </span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {currentOption.descripcion} · Celulares: {currentOption.escalaMobile} / PCs: {currentOption.escalaDesktop}
          </p>
        </div>

        {/* Botones de acción directa A- y A+ */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={handleDisminuir}
            disabled={isMin}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-xs select-none active:scale-95 ${
              isMin
                ? 'opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-800 text-gray-400 border border-gray-200 dark:border-gray-700'
                : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-300 dark:border-gray-600 cursor-pointer'
            }`}
            title="Disminuir tamaño de letra (A-)"
          >
            <span className="text-base font-black">A-</span>
            <span className="hidden sm:inline">Disminuir</span>
          </button>

          <button
            type="button"
            onClick={handleAumentar}
            disabled={isMax}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-xs select-none active:scale-95 ${
              isMax
                ? 'opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-800 text-gray-400 border border-gray-200 dark:border-gray-700'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700 cursor-pointer shadow-indigo-600/20'
            }`}
            title="Aumentar tamaño de letra (A+)"
          >
            <span className="text-lg font-black">A+</span>
            <span className="hidden sm:inline">Aumentar</span>
          </button>
        </div>
      </div>

      {/* Selector Cuadrícula de Niveles Preset */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
          Niveles de Accesibilidad Predefinidos
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {FONT_SIZE_OPTIONS.map((opt) => {
            const isSelected = fontSize === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt.id)}
                className={`relative flex flex-col justify-between p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 dark:border-indigo-500 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40 hover:bg-gray-100/70 dark:hover:bg-gray-800/60'
                }`}
              >
                {/* Header de la tarjeta con muestra tipográfica */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span
                      className={`font-bold block ${
                        isSelected
                          ? 'text-indigo-900 dark:text-indigo-200'
                          : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      {opt.porcentaje}
                    </span>
                  </div>

                  {/* Letra de muestra según la escala */}
                  <span
                    className={`font-black select-none leading-none ${
                      opt.id === 'compacto'
                        ? 'text-base'
                        : opt.id === 'normal'
                        ? 'text-xl'
                        : opt.id === 'grande'
                        ? 'text-2xl'
                        : 'text-3xl'
                    } ${
                      isSelected
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    Aa
                  </span>
                </div>

                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">
                  {opt.descripcion}
                </p>

                {isSelected && (
                  <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    Seleccionado
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Simulador / Vista Previa en Vivo */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-900/60 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Vista previa en tiempo real
          </span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            Escala activa: <strong className="text-indigo-600 dark:text-indigo-400">{currentOption.label}</strong>
          </span>
        </div>

        {/* Tarjeta simulada de producto/venta para comprobar la legibilidad */}
        <div className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900 dark:text-gray-100">
                Gaseosa Cola 500ml
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Stock: 24 u.
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Código: 7791234567890 · Categoría: Bebidas
            </p>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
              $1.850
            </span>
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs shadow-xs hover:bg-indigo-700 transition-colors pointer-events-none"
            >
              + Agregar
            </button>
          </div>
        </div>

        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
          💡 <strong>Nota de uso:</strong> Esta preferencia se guarda individualmente en cada dispositivo (navegador o equipo de mostrador), permitiendo que una pantalla táctil de cobro use <em>Grande o Extra Grande</em> para mayor comodidad visual, mientras que una computadora de oficina puede mantener el modo <em>Normal</em>.
        </p>
      </div>

      {/* Control de Contraste y Tema Oscuro / Claro integrado */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 block">
            Contraste de Pantalla (Tema)
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Alterná entre fondo claro de alto contraste o modo oscuro descansado.
          </span>
        </div>

        <button
          type="button"
          onClick={toggleTema}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 transition-colors self-start sm:self-auto cursor-pointer"
        >
          <span>{tema === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Oscuro'}</span>
        </button>
      </div>
    </div>
  )
}

export default AccessibilityConfigSection
