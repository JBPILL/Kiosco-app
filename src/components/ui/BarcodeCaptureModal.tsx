import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Modal } from './Modal'
import { Button } from './Button'
import { Input } from './Input'
import { playScanSound } from '../../lib/sound'

interface BarcodeCaptureModalProps {
  isOpen: boolean
  onClose: () => void
  onBarcodeCaptured: (barcode: string) => void
  title?: string
}

export function BarcodeCaptureModal({
  isOpen,
  onClose,
  onBarcodeCaptured,
  title = 'Escanear Código de Barras',
}: BarcodeCaptureModalProps) {
  const [iniciando, setIniciando] = useState(true)
  const [errorCamara, setErrorCamara] = useState<string | null>(null)
  const [camaras, setCamaras] = useState<Array<{ id: string; label: string }>>([])
  const [camaraActualId, setCamaraActualId] = useState<string | null>(null)
  const [antorchaEncendida, setAntorchaEncendida] = useState(false)
  const [soportaAntorcha, setSoportaAntorcha] = useState(false)
  const [codigoManual, setCodigoManual] = useState('')

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const elementId = 'barcode-capture-viewport'

  // Procesar código leído
  const procesarCodigo = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim()
      if (!code) return

      playScanSound('success')
      onBarcodeCaptured(code)
      onClose()
    },
    [onBarcodeCaptured, onClose]
  )

  // Iniciar el escáner
  const iniciarEscaner = useCallback(
    async (cameraId?: string) => {
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
    },
    [procesarCodigo]
  )

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

  // Asignar código manual
  const handleAceptarManual = (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigoManual.trim()) return
    procesarCodigo(codigoManual)
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
      setCodigoManual('')
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
      title={title}
      size="md"
      zIndex="z-[60]"
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

        {/* Instrucción rápida */}
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          Apuntá la cámara al código de barras del producto. Se capturará de forma automática al enfocarlo.
        </p>

        {/* Fallback de entrada manual */}
        <form onSubmit={handleAceptarManual} className="pt-2 border-t border-gray-100 dark:border-gray-700">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                label="¿Código dañado o ilegible? Escribilo acá:"
                placeholder="Ej: 7791234567890"
                value={codigoManual}
                onChange={(e) => setCodigoManual(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={!codigoManual.trim()}
              className="h-[38px]"
            >
              Asignar
            </Button>
          </div>
        </form>

        <div className="pt-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
