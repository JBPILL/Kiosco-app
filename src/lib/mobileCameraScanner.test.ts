import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { restriccionesVideoCamaraIOS, cuadroEscaneoMovil, errorCamaraMovil, iniciarVistaCamaraIOS, listarCamarasAutorizadas, puedeReintentarCamara } from './mobileCameraScanner'
const hd = vi.hoisted(() => ({ decode: vi.fn() }))
vi.mock('./cameraFrameDecoder', () => ({ decodificarFrameCamaraHD: hd.decode }))
beforeEach(() => { hd.decode.mockReset().mockRejectedValue(new Error('no barcode')) })

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it.each([[180, 120], [320, 200], [390, 240], [1280, 720]])('mantiene lectura dentro del visor %s por %s', (ancho, alto) => {
  const cuadro = cuadroEscaneoMovil(ancho, alto)
  expect(cuadro.width).toBeLessThanOrEqual(ancho)
  expect(cuadro.height).toBeLessThanOrEqual(alto)
  expect(cuadro.width).toBeGreaterThan(0)
})
it('no vuelve a pedir cámara ante rechazo de permisos u ocupación', () => {
  expect(puedeReintentarCamara(new DOMException('denied', 'NotAllowedError'))).toBe(false)
  expect(puedeReintentarCamara(new DOMException('busy', 'NotReadableError'))).toBe(false)
  expect(puedeReintentarCamara(new DOMException('constraints', 'OverconstrainedError'))).toBe(true)
})
it('distingue permisos, cámara ausente y entorno incompatible', () => {
  expect(errorCamaraMovil(new DOMException('', 'NotAllowedError'))).toContain('permiso')
  expect(errorCamaraMovil(new DOMException('', 'NotFoundError'))).toContain('manualmente')
  expect(errorCamaraMovil(new Error('CAMERA_UNAVAILABLE'))).toContain('HTTPS')
})

it('lista cámaras autorizadas sin abrir otra pista de video', async () => {
  const getUserMedia = vi.fn()
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([
    { kind: 'videoinput', deviceId: 'trasera', label: 'Trasera' },
    { kind: 'audioinput', deviceId: 'micro', label: 'Micrófono' },
    { kind: 'videoinput', deviceId: 'frontal', label: '' },
  ]) } })
  expect(await listarCamarasAutorizadas()).toEqual([{ id: 'trasera', label: 'Trasera' }, { id: 'frontal', label: 'Cámara 2' }])
  expect(getUserMedia).not.toHaveBeenCalled()
})

it('limita el canvas iOS a diez frames por segundo y libera el ciclo al cerrar', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
  const contenedor = document.createElement('div')
  const video = document.createElement('video')
  contenedor.append(video)
  Object.defineProperties(contenedor, { clientWidth: { value: 390 }, clientHeight: { value: 260 } })
  Object.defineProperties(video, { readyState: { value: 2 }, videoWidth: { value: 640 }, videoHeight: { value: 480 } })
  const drawImage = vi.fn().mockImplementationOnce(() => { throw new Error('Frame interrumpido') })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  let siguiente: FrameRequestCallback = () => {}
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { siguiente = callback; return 1 })
  const cancelar = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  const limpiar = iniciarVistaCamaraIOS(contenedor)
  siguiente(0); siguiente(16); siguiente(100)
  expect(drawImage).toHaveBeenCalledTimes(2)
  expect(video.style.opacity).toBe('')
  limpiar()
  siguiente(200)
  expect(drawImage).toHaveBeenCalledTimes(2)
  expect(cancelar).toHaveBeenCalledWith(1)
  expect(contenedor.querySelector('canvas')).toBeNull()
})


function visorHD() {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
  const el = document.createElement('div'), video = document.createElement('video')
  const guia = document.createElement('div'); guia.id = 'qr-shaded-region'
  el.append(video, guia)
  Object.defineProperties(el, { clientWidth: { value: 390 }, clientHeight: { value: 260 } })
  Object.defineProperties(video, { readyState: { value: 2 }, videoWidth: { value: 1920 }, videoHeight: { value: 1080 } })
  const draw = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D)
  let frame: FrameRequestCallback = () => {}
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1 })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  return { el, video, guia, draw, frame: (time: number) => frame(time) }
}

it('solicita detalle HD ideal en iOS y respeta la cámara elegida', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
  expect(restriccionesVideoCamaraIOS()).toEqual({ facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } })
  expect(restriccionesVideoCamaraIOS('trasera')).toEqual({ deviceId: { exact: 'trasera' }, width: { ideal: 1920 }, height: { ideal: 1080 } })
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android')
  expect(restriccionesVideoCamaraIOS()).toBeUndefined()
})

it('conserva más píxeles que el visor CSS, decodifica como máximo dos veces por segundo y restaura la guía', async () => {
  const v = visorHD(), capturar = vi.fn()
  hd.decode.mockResolvedValue('7791519701085')
  v.guia.remove()
  const cerrar = iniciarVistaCamaraIOS(v.el, capturar)
  await vi.dynamicImportSettled()
  v.el.append(v.guia) // The SDK adds the guide when video playback begins.
  v.frame(0)
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  const canvas = v.el.querySelector('canvas')!
  expect(canvas.width).toBe(1280)
  expect(canvas.height).toBe(853)
  expect(v.draw.mock.calls[0][0]).toBe(v.video)
  expect(v.draw.mock.calls[0][1]).toBeCloseTo(150)
  expect(v.draw.mock.calls[0][3]).toBeCloseTo(1620)
  expect(capturar).toHaveBeenCalledWith('7791519701085')
  v.frame(100); v.frame(400); v.frame(499)
  expect(hd.decode).toHaveBeenCalledOnce()
  v.frame(500)
  expect(hd.decode).toHaveBeenCalledTimes(2)
  expect(v.guia.style.visibility).toBe('hidden')
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  v.frame(1000)
  expect(hd.decode).toHaveBeenCalledTimes(2)
  cerrar()
  expect(v.guia.style.visibility).toBe('')
  expect(v.el.querySelector('canvas')).toBeNull()
})

it('no solapa intentos HD ni entrega un resultado que llega después de cerrar', async () => {
  const v = visorHD(), capturar = vi.fn()
  let resolver: (code: string) => void = () => {}
  hd.decode.mockReturnValue(new Promise<string>(resolve => { resolver = resolve }))
  const cerrar = iniciarVistaCamaraIOS(v.el, capturar)
  await vi.dynamicImportSettled()
  v.frame(0); v.frame(1000)
  expect(hd.decode).toHaveBeenCalledOnce()
  cerrar(); resolver('7791519701085')
  await Promise.resolve(); await Promise.resolve()
  expect(capturar).not.toHaveBeenCalled()
  v.frame(2000)
  expect(hd.decode).toHaveBeenCalledOnce()
})
