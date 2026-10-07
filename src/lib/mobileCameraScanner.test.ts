import { expect, it } from 'vitest'
import { cuadroEscaneoMovil, errorCamaraMovil, puedeReintentarCamara } from './mobileCameraScanner'
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
