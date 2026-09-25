import { useState, useEffect, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatPrecio } from '../../lib/utils'
import { leerPesoBalanzaSerial } from '../../lib/serialScale'
import { isWebSerialSupported } from '../../lib/escposPrinter'
import type { Producto } from '../../types/database'
import toast from 'react-hot-toast'

interface BalanzaManualModalProps {
  isOpen: boolean
  onClose: () => void
  producto: Producto | null
  onConfirmar: (pesoKg: number) => void
}

const PRESETS_PESO = [
  { label: '100g', gramos: 100 },
  { label: '150g', gramos: 150 },
  { label: '200g', gramos: 200 },
  { label: '250g (1/4)', gramos: 250 },
  { label: '300g', gramos: 300 },
  { label: '500g (1/2)', gramos: 500 },
  { label: '750g (3/4)', gramos: 750 },
  { label: '1.000g (1kg)', gramos: 1000 },
]

export function BalanzaManualModal({
  isOpen,
  onClose,
  producto,
  onConfirmar,
}: BalanzaManualModalProps) {
  const [gramos, setGramos] = useState<string>('250')
  const [leyendoBalanza, setLeyendoBalanza] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setGramos('250')
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, 50)
    }
  }, [isOpen])

  if (!producto) return null

  const gramosNum = parseFloat(gramos) || 0
  const pesoKg = Number((gramosNum / 1000).toFixed(3))
  const precioKilo = producto.precio_venta || 0
  const subtotal = Math.round(pesoKg * precioKilo)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pesoKg > 0) {
      onConfirmar(pesoKg)
      onClose()
    }
  }

  const handleSelectPreset = (gr: number) => {
    setGramos(gr.toString())
    onConfirmar(Number((gr / 1000).toFixed(3)))
    onClose()
  }

  const handleLeerBalanzaSerial = async () => {
    setLeyendoBalanza(true)
    try {
      const res = await leerPesoBalanzaSerial()
      if (res.ok && res.pesoKg !== undefined) {
        const gr = Math.round(res.pesoKg * 1000)
        setGramos(gr.toString())
        toast.success(`Peso capturado: ${res.pesoKg.toFixed(3)} kg`)
      } else {
        toast.error(res.mensaje)
      }
    } catch (e: unknown) {
      toast.error('Error al comunicar con la balanza: ' + ((e as Error).message || ''))
    } finally {
      setLeyendoBalanza(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Venta por Peso: ${producto.descripcion}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Cabecera del producto pesable */}
        <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-indigo-700 dark:text-indigo-400 font-semibold uppercase tracking-wider">
              Precio por Kilo / Unidad
            </p>
            <p className="text-lg font-extrabold text-indigo-950 dark:text-indigo-200">
              {formatPrecio(precioKilo)}{' '}
              <span className="text-xs font-medium text-gray-500">
                / {producto.unidad_medida || 'KG'}
              </span>
            </p>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-gray-500 dark:text-gray-400 block">Subtotal a cobrar:</span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatPrecio(subtotal)}
            </span>
          </div>
        </div>

        {/* Acceso directo a pesos populares de fiambrería */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Pesos rápidos de mostrador:
          </label>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS_PESO.map((p) => (
              <button
                key={p.gramos}
                type="button"
                onClick={() => handleSelectPreset(p.gramos)}
                className={`py-2 px-1 text-center rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                  gramosNum === p.gramos
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Entrada numérica de gramos o kilos */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              O escribí los gramos exactos:
            </label>
            {isWebSerialSupported() && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleLeerBalanzaSerial}
                loading={leyendoBalanza}
                disabled={leyendoBalanza}
                className="text-xs py-1 px-2.5 h-auto whitespace-nowrap shadow-xs"
                title="Capturar peso automáticamente desde balanza conectada por cable USB o Serial RS-232"
              >
                <span>{leyendoBalanza ? 'Leyendo...' : 'Leer Balanza USB'}</span>
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="number"
                step="1"
                min="1"
                value={gramos}
                onChange={(e) => setGramos(e.target.value)}
                placeholder="Ej: 350"
                className="w-full text-lg font-bold text-gray-900 dark:text-gray-100 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none tabular-nums"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                gramos (gr)
              </span>
            </div>
            <div className="p-2.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap tabular-nums">
              = {pesoKg.toFixed(3)} kg
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2 pt-2">
          <Button type="submit" fullWidth disabled={pesoKg <= 0}>
            Agregar al Ticket ({formatPrecio(subtotal)})
          </Button>
          <Button type="button" variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
