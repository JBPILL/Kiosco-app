import { afterEach, expect, it, vi } from 'vitest'
import { cuadroEscaneoMovil, errorCamaraMovil, iniciarVistaCamaraIOS, listarCamarasAutorizadas, puedeReintentarCamara } from './mobileCameraScanner'
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
