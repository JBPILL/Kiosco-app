import { cuadroEscaneoMovil, errorCamaraMovil, iniciarVistaCamaraIOS, listarCamarasAutorizadas, puedeReintentarCamara } from '../../lib/mobileCameraScanner'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { supabase } from '../../lib/supabase'
import { playScanSound } from '../../lib/sound'
import { formatPrecio, getCachedProductos } from '../../lib/utils'
import { buscarCodigoCamaraLocal } from '../../lib/cameraBarcodeCache'
import type { Producto } from '../../types/database'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../stores/authStore'
import { useCartStore } from '../../stores/cartStore'

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
  const limpiarVistaCamaraRef = useRef<(() => void) | null>(null)
  const cooldownRef = useRef<{ code: string; time: number }>({ code: '', time: 0 })
  const isStartingRef = useRef(false)
  const reinicioPendienteRef = useRef<{ cameraId?: string } | null>(null)
  const isStoppingRef = useRef(false)
  const abiertoRef = useRef(isOpen)
  abiertoRef.current = isOpen
  const generacionRef = useRef(0)
  const consultasRef = useRef(new Set<string>())

  const onProductScannedRef = useRef(onProductScanned)
  const onCloseRef = useRef(onClose)
  const modoContinuoRef = useRef(modoContinuo)

  useEffect(() => {
    onProductScannedRef.current = onProductScanned
    onCloseRef.current = onClose
    modoContinuoRef.current = modoContinuo
  }, [onProductScanned, onClose, modoContinuo])

  const elementId = 'barcode-scanner-viewport'

  // Procesar código leído
  const procesarCodigo = useCallback(async (rawCode: string) => {
    const code = rawCode.trim()
    if (!code || !abiertoRef.current || consultasRef.current.has(code)) return
    const contexto = useAuthStore.getState()
    if (!contexto.usuario?.activo || !contexto.kiosco?.id || contexto.usuario.kiosco_id !== contexto.kiosco.id) return
    const ticket = useCartStore.getState().tabActivaId
    const generacion = generacionRef.current
    const vigente = () => {
      const actual = useAuthStore.getState()
      return abiertoRef.current && generacionRef.current === generacion
        && actual.usuario?.activo && actual.usuario.id === contexto.usuario?.id
        && actual.usuario.auth_user_id === contexto.usuario?.auth_user_id
        && actual.kiosco?.id === contexto.kiosco?.id && useCartStore.getState().tabActivaId === ticket
    }

    // Cooldown de 1.8 segundos para el mismo código consecutivo
    const now = Date.now()
    if (cooldownRef.current.code === code && now - cooldownRef.current.time < 1800) {
      return
    }
    cooldownRef.current = { code, time: now }
    consultasRef.current.add(code)

    try {
      const sinConexion = !navigator.onLine
      const { data, error } = sinConexion
        ? { data: buscarCodigoCamaraLocal(getCachedProductos(contexto.kiosco.id), contexto.kiosco.id, code), error: null }
        : await supabase.from('productos')
          .select('*, categoria:categorias(nombre, color)')
          .eq('activo', true).eq('kiosco_id', contexto.kiosco.id)
          .eq('codigo_barras', code).maybeSingle()

      if (!vigente()) return
      if (error) throw error

      if (data) {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate([40, 30, 40]) } catch {}
        }
        setUltimoEscaneo({
          producto: data,
          codigo: code,
          exito: true,
        })
        toast.success(`${data.descripcion} agregado al ticket${sinConexion ? ' · catálogo guardado sin conexión' : ''}`)
        onProductScannedRef.current(data)

        if (!modoContinuoRef.current) {
          onCloseRef.current()
        }
      } else {
        playScanSound('warning')
        setUltimoEscaneo({
          codigo: code,
          exito: false,
        })
        toast.error(`Código no encontrado: ${code}`)
      }
    } catch (err) {
      if (vigente()) {
        console.error('Error al buscar producto por código de barras:', err)
        playScanSound('error')
      }
    } finally {
      consultasRef.current.delete(code)
    }
  }, [])

  // Detener escáner
  const detenerEscaner = useCallback(async () => {
    if (isStoppingRef.current) return
    isStoppingRef.current = true
    reinicioPendienteRef.current = null
    limpiarVistaCamaraRef.current?.()
    limpiarVistaCamaraRef.current = null
    const scanner = scannerRef.current
    scannerRef.current = null

    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop()
        }
        scanner.clear()
      } catch (err) {
        console.error('Error al detener cámara:', err)
      }
    }
    setAntorchaEncendida(false)
    setSoportaAntorcha(false)
    isStoppingRef.current = false
  }, [])

  // Iniciar el escáner
  const iniciarEscaner = useCallback(async (cameraId?: string): Promise<void> => {
    if (!abiertoRef.current) return
    if (isStartingRef.current) {
      reinicioPendienteRef.current = { cameraId }
      return
    }
    isStartingRef.current = true
    setIniciando(true)
    setErrorCamara(null)
    setAntorchaEncendida(false)
    setSoportaAntorcha(false)

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('CAMERA_UNAVAILABLE')
      limpiarVistaCamaraRef.current?.()
      limpiarVistaCamaraRef.current = null
      // Detener escáner previo si está corriendo
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop()
      }
      if (scannerRef.current) {
        try { scannerRef.current.clear() } catch {}
        scannerRef.current = null
      }

      if (!abiertoRef.current) return
      const el = document.getElementById(elementId)
      if (!el) {
        setIniciando(false)
        isStartingRef.current = false
        return
      }

      const scanner = new Html5Qrcode(elementId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
        verbose: false,
      })
      scannerRef.current = scanner

      const scanConfig = {
        fps: 10,
        qrbox: cuadroEscaneoMovil,
      }

      const targetCamera = cameraId ? cameraId : { facingMode: 'environment' }

      try {
        await scanner.start(
          targetCamera,
          scanConfig,
          (decodedText) => {
            if (scannerRef.current === scanner) void procesarCodigo(decodedText)
          },
          () => {}
        )
      } catch (firstErr) {
        console.warn('Fallo al iniciar cámara con targetCamera, intentando user/default:', firstErr)
        if (!cameraId && puedeReintentarCamara(firstErr)) {
          await scanner.start(
            { facingMode: 'user' },
            { ...scanConfig, videoConstraints: {} },
            (decodedText) => {
              if (scannerRef.current === scanner) void procesarCodigo(decodedText)
            },
            () => {}
          )
        } else {
          throw firstErr
        }
      }

      if (scannerRef.current !== scanner) {
        if (scanner.isScanning) await scanner.stop()
        scanner.clear()
        return
      }
      limpiarVistaCamaraRef.current = iniciarVistaCamaraIOS(el)
      const activeDeviceId = scanner.getRunningTrackSettings().deviceId
      if (activeDeviceId) setCamaraActualId(activeDeviceId)

      if (typeof targetCamera === 'string') {
        setCamaraActualId(targetCamera)
      }

      // Enumerar cámaras una vez concedidos los permisos
      try {
        const devices = await listarCamarasAutorizadas()
        if (scannerRef.current !== scanner || !abiertoRef.current) return
        if (devices && devices.length > 0) {
          setCamaras(devices)
          if (!activeDeviceId && !cameraId && !camaraActualId && devices.length === 1) {
            setCamaraActualId(devices[0].id)
          }
        }
      } catch {
        // Ignorar si falla la enumeración
      }

      // Verificar linterna
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
      setErrorCamara(errorCamaraMovil(err))
      setIniciando(false)
    } finally {
      isStartingRef.current = false
      const pendiente = reinicioPendienteRef.current
      reinicioPendienteRef.current = null
      if (pendiente && abiertoRef.current) void iniciarEscaner(pendiente.cameraId)
    }
  }, [procesarCodigo, camaraActualId])

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
    generacionRef.current++
    if (isOpen) {
      const t = setTimeout(() => {
        iniciarEscaner()
      }, 150)
      return () => { clearTimeout(t); generacionRef.current++ }
    } else {
      detenerEscaner()
      setUltimoEscaneo(null)
    }
  }, [isOpen])

  // Limpiar al desmontar
  useEffect(() => {
    abiertoRef.current = isOpen
    return () => {
      abiertoRef.current = false
      detenerEscaner()
    }
  }, [detenerEscaner])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Lector de cámara"
      size="md"
      zIndex="z-[60]"
    >
      <div className="space-y-3">
        {/* Contenedor del visor de la cámara */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/40 p-2 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <span role="status" className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{errorCamara ? 'Cámara no disponible' : iniciando ? 'Conectando…' : 'Cámara activa'}</span>
          <div className="flex gap-2">
            {soportaAntorcha && <button type="button" onClick={toggleAntorcha} disabled={iniciando} aria-pressed={antorchaEncendida} className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-semibold dark:text-gray-200">{antorchaEncendida ? 'Apagar luz' : 'Luz'}</button>}
            {camaras.length > 1 && <button type="button" onClick={cambiarCamara} disabled={iniciando} className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-semibold dark:text-gray-200">Cambiar</button>}
            <button type="button" onClick={() => iniciarEscaner(camaraActualId ?? undefined)} disabled={iniciando} aria-label="Reiniciar cámara" className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-semibold dark:text-gray-200">↻</button>
          </div>
        </div>
        <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] max-h-[38dvh] flex items-center justify-center border border-gray-700 shadow-inner">
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

        </div>
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
          <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/40 px-3 py-2.5">
            <label htmlFor="camara-modo-continuo" className="text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              Escaneo continuo
            </label>
            <input
              id="camara-modo-continuo"
              type="checkbox"
              checked={modoContinuo}
              onChange={(e) => setModoContinuo(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
            />
          </div>

          {/* Fallback de entrada manual */}
          <form onSubmit={handleBuscarManual} className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Input
                placeholder="Ingresar código numérico a mano..."
                aria-label="Código manual"
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
