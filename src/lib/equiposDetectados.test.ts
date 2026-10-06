import { beforeEach, expect, it } from 'vitest'
import { completarEquiposVacios, detectarEquiposAutorizados, leerSeleccionEquiposUSB } from './equiposDetectados'
import type { NavegadorEquipos } from './equiposDetectados'
import { normalizarEquiposComercio } from '../components/config/EquiposComercioSection'

beforeEach(() => localStorage.clear())
const usb = (devices: Array<{ vendorId: number; productId: number; productName: string; deviceClass: number }>) =>
  Object.assign(new EventTarget(), { getDevices: async () => devices, requestDevice: async () => devices[0] })
it('completa un dispositivo autorizado sin sobrescribir datos manuales ni inventar protocolo', async () => {
  const nav: NavegadorEquipos = { usb: usb([{ vendorId: 1, productId: 2, productName: 'Printer A', deviceClass: 7 }]) }
  const datos = await detectarEquiposAutorizados(nav, null)
  expect(datos.impresora).toEqual({ impresoraModelo: 'Printer A', impresoraConexion: 'USB' })
  const actual = { ...normalizarEquiposComercio(null), impresoraModelo: 'Mi modelo' }
  expect(completarEquiposVacios(actual, datos.impresora!)).toMatchObject({ impresoraModelo: 'Mi modelo', impresoraTipo: '', impresoraConexion: 'USB' })
})
it('no confunde cualquier puerto con una impresora ni elige entre dispositivos iguales', async () => {
  const serial = Object.assign(new EventTarget(), { getPorts: async () => [{ getInfo: () => ({ usbVendorId: 1, usbProductId: 2 }) }] })
  expect((await detectarEquiposAutorizados({ serial }, null)).impresora).toBeNull()
  expect((await detectarEquiposAutorizados({ serial }, { usbVendorId: 1, usbProductId: 2 })).impresora).toEqual({ impresoraConexion: 'USB / serial' })
  const devices = [{ vendorId: 1, productId: 2, productName: 'Printer', deviceClass: 7 }, { vendorId: 1, productId: 2, productName: 'Printer', deviceClass: 7 }]
  expect(await detectarEquiposAutorizados({ usb: usb(devices) }, null)).toMatchObject({ impresora: null, ambiguos: true })
})
it('identifica lectores HID de código de barras y tolera un navegador sin APIs', async () => {
  const hid = Object.assign(new EventTarget(), { getDevices: async () => [
    { vendorId: 3, productId: 4, productName: 'Scanner', collections: [{ usagePage: 0x8c }] },
    { vendorId: 5, productId: 6, productName: 'Keyboard', collections: [{ usagePage: 1 }] },
  ] })
  expect((await detectarEquiposAutorizados({ hid }, null)).lector).toEqual({ lectorModelo: 'Scanner', lectorConexion: 'HID (navegador)' })
  expect(await detectarEquiposAutorizados({}, null)).toEqual({ impresora: null, lector: null, ambiguos: false })
})
it('recuerda sólo identidades válidas y no detecta dispositivos desconectados', async () => {
  localStorage.setItem('kioskopos_equipos_usb_puesto_v1', JSON.stringify({ lector: { vendorId: 4, productId: 5 }, impresora: { vendorId: -1, productId: 2 } }))
  const seleccion = leerSeleccionEquiposUSB()
  expect(seleccion).toEqual({ lector: { vendorId: 4, productId: 5 } })
  expect((await detectarEquiposAutorizados({ usb: usb([]) }, null, seleccion)).lector).toBeNull()
  expect((await detectarEquiposAutorizados({ usb: usb([{ vendorId: 4, productId: 5, productName: 'Scanner A', deviceClass: 0 }]) }, null, seleccion)).lector?.lectorModelo).toBe('Scanner A')
})
