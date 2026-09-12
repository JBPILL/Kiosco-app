import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { supabase } from '../../lib/supabase'
import { playScanSound } from '../../lib/sound'
import { formatPrecio } from '../../lib/utils'
import type { Producto } from '../../types/database'

interface BarcodeScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onProductScanned: (producto: Producto) => void
}

export function BarcodeScannerModal({
  isOpen,
  onClose,
  onProductScanned,
}: BarcodeScannerModalProps) {
  const [iniciando, setIniciando] = useState(true)
  const [errorCamara, setErrorCamara] = useState<string | null>(null)
  const [modoContinuo, setModoContinuo] = useState(true)
  const [ultimoEscaneo, setUltimoEscaneo] = useState<{
    producto?: Producto
    codigo: string
    exito: boolean
  } | null>(null)
  const [camaras, setCamaras] = useState<Array<{ id: string; label: string }>>([])
  const [camaraActualId, setCamaraActualId] = useState<string | null>(null)
  const [antorchaEncendida, setAntorchaEncendida] = useState(false)
  const [soportaAntorcha, setSoportaAntorcha] = useState(false)
  const [codigoManual, setCodigoManual] = useState('')
  const [buscandoManual, setBuscandoManual] = useState(false)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const cooldownRef = useRef<{ code: string; time: number }>({ code: '', time: 0 })
  const elementId = 'barcode-scanner-viewport'

  // Procesar código leído
  const procesarCodigo = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim()
      if (!code) return

      // Cooldown de 1.8 segundos para el mismo código consecutivo
      const now = Date.now()
      if (cooldownRef.current.code === code && now - cooldownRef.current.time < 1800) {
        return
      }
      cooldownRef.current = { code, time: now }

      try {
        const { data, error } = await supabase
          .from('productos')
          .select('*, categoria:categorias(nombre, color)')
          .eq('activo', true)
          .eq('codigo_barras', code)
          .maybeSingle()

        if (error) throw error

        if (data) {
          playScanSound('success')
          setUltimoEscaneo({
            producto: data,
            codigo: code,
            exito: true,
          })
          onProductScanned(data)

          if (!modoContinuo) {
            onClose()
          }
        } else {
          playScanSound('warning')
          setUltimoEscaneo({
            codigo: code,
            exito: false,
          })
        }
      } catch (err) {
        console.error('Error al buscar producto por código de barras:', err)
        playScanSound('error')
      }
    },
    [modoContinuo, onClose, onProductScanned]
  )

  // Iniciar el escáner
  const iniciarEscaner = useCallback(async (cameraId?: string) => {
    setIniciando(true)
    setErrorCamara(null)

    try {
      // Detener escáner previo si está corriendo
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop()
      }

      // Obtener lista de cámaras si aún no se listaron
      const devices = await Html5Qrcode.getCameras()
      if (!devices || devices.length === 0) {
        setErrorCamara('No se detectaron cámaras en este dispositivo.')
        setIniciando(false)
        return
      }

      setCamaras(devices.map((d) => ({ id: d.id, label: d.label || `Cámara ${d.id}` })))

      const scanner =
        scannerRef.current ||
        new Html5Qrcode(elementId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        })
      scannerRef.current = scanner

      const targetCamera = cameraId || { facingMode: 'environment' }

      await scanner.start(
        targetCamera,
        {
          fps: 15,
          qrbox: { width: 280, height: 160 },
          aspectRatio: 1.2,
        },
        (decodedText) => {
          procesarCodigo(decodedText)
        },
        () => {
          // Ignorar cuadros sin código
        }
      )

      if (typeof targetCamera === 'string') {
        setCamaraActualId(targetCamera)
      } else if (devices.length > 0) {
        setCamaraActualId(devices[0].id)
      }

      // Verificar soporte de linterna / flash
      try {
        const caps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
          torch?: boolean
        }
        setSoportaAntorcha(Boolean(caps && 'torch' in caps && caps.torch))
      } catch {
        setSoportaAntorcha(false)
      }

      setIniciando(false)
    } catch (err: unknown) {
      console.error('Error al inicializar cámara:', err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setErrorCamara('Permiso de cámara denegado. Habilitá la cámara en la configuración de tu navegador.')
      } else {
        setErrorCamara('No se pudo acceder a la cámara. Verificá que no esté en uso por otra aplicación.')
      }
      setIniciando(false)
    }
  }, [procesarCodigo])

  // Detener escáner
  const detenerEscaner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop()
        }
        scannerRef.current.clear()
      } catch (err) {
        console.error('Error al detener cámara:', err)
      }
      scannerRef.current = null
    }
  }, [])

  // Alternar linterna
  const toggleAntorcha = async () => {
    if (!scannerRef.current || !soportaAntorcha) return
    try {
      const nuevoEstado = !antorchaEncendida
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nuevoEstado } as unknown as MediaTrackConstraintSet],
      })
      setAntorchaEncendida(nuevoEstado)
    } catch (err) {
      console.warn('No se pudo activar la linterna:', err)
    }
  }

  // Cambiar de cámara (ej: frontal a trasera)
  const cambiarCamara = async () => {
    if (camaras.length <= 1) return
    const currentIndex = camaras.findIndex((c) => c.id === camaraActualId)
    const nextIndex = (currentIndex + 1) % camaras.length
    const nextCamera = camaras[nextIndex]
    await iniciarEscaner(nextCamera.id)
  }

  // Búsqueda manual
  const handleBuscarManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigoManual.trim()) return

    setBuscandoManual(true)
    await procesarCodigo(codigoManual)
    setBuscandoManual(false)
    setCodigoManual('')
  }

  useEffect(() => {
    if (isOpen) {
      // Pequeño retardo para asegurar que el DOM del modal esté listo
      const t = setTimeout(() => {
        iniciarEscaner()
      }, 150)
      return () => clearTimeout(t)
    } else {
      detenerEscaner()
      setUltimoEscaneo(null)
    }
  }, [isOpen, iniciarEscaner, detenerEscaner])

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      detenerEscaner()
    }
  }, [detenerEscaner])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Escanear Código de Barras"
      size="md"
    >
      <div className="space-y-4">
        {/* Contenedor del visor de la cámara */}
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center border border-gray-700 shadow-inner">
          {iniciando && !errorCamara && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-900/80 text-white gap-2">
              <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Iniciando cámara...</p>
            </div>
          )}

          {errorCamara && (
            <div className="p-6 text-center text-white z-10 space-y-3 max-w-xs">
              <p className="text-xs text-red-300 font-semibold">{errorCamara}</p>
              <Button size="sm" variant="secondary" onClick={() => iniciarEscaner()}>
                Reintentar
              </Button>
            </div>
          )}

          {/* Elemento donde html5-qrcode renderiza el video */}
          <div id={elementId} className="w-full h-full object-cover" />

          {/* Controles flotantes en la cámara */}
          {!iniciando && !errorCamara && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
              {soportaAntorcha && (
                <button
                  type="button"
                  onClick={toggleAntorcha}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors backdrop-blur-md ${
                    antorchaEncendida
                      ? 'bg-amber-400 text-gray-950 shadow-md'
                      : 'bg-black/50 text-white hover:bg-black/70'
                  }`}
                  title="Linterna"
                >
                  {antorchaEncendida ? 'Luz: ON' : 'Luz'}
                </button>
              )}

              {camaras.length > 1 && (
                <button
                  type="button"
                  onClick={cambiarCamara}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition-colors"
                  title="Cambiar cámara"
                >
                  Girar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Banner de último resultado escaneado */}
        {ultimoEscaneo && (
          <div
            className={`p-3 rounded-xl border text-xs animate-in fade-in slide-in-from-top-1 duration-150 ${
              ultimoEscaneo.exito && ultimoEscaneo.producto
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
            }`}
          >
            {ultimoEscaneo.exito && ultimoEscaneo.producto ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold truncate text-sm">
                    {ultimoEscaneo.producto.descripcion}
                  </p>
                  <p className="text-[11px] opacity-80">
                    Código: {ultimoEscaneo.codigo} · Stock: {ultimoEscaneo.producto.stock_actual}
                  </p>
                </div>
                <span className="text-sm font-black whitespace-nowrap">
                  {formatPrecio(ultimoEscaneo.producto.precio_venta)}
                </span>
              </div>
            ) : (
              <div>
                <p className="font-bold">Código no encontrado</p>
                <p className="text-[11px] opacity-80 mt-0.5">
                  El código <span className="font-mono font-bold">{ultimoEscaneo.codigo}</span> no está asociado a ningún producto activo.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Opciones y entrada manual */}
        <div className="space-y-3 pt-1 border-t border-gray-200 dark:border-gray-700">
          {/* Toggle de Modo Continuo */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              Modo continuo (seguir escaneando)
            </label>
            <input
              type="checkbox"
              checked={modoContinuo}
              onChange={(e) => setModoContinuo(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
            />
          </div>

          {/* Fallback de entrada manual */}
          <form onSubmit={handleBuscarManual} className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Ingresar código numérico a mano..."
                value={codigoManual}
                onChange={(e) => setCodigoManual(e.target.value)}
                disabled={buscandoManual}
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!codigoManual.trim() || buscandoManual}
              className="flex-shrink-0 self-end mb-1"
            >
              Agregar
            </Button>
          </form>
        </div>

        <div className="pt-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cerrar Escáner
          </Button>
        </div>
      </div>
    </Modal>
  )
}
