import type { EquiposComercio } from '../types/database'

export interface DispositivoUSB {
  vendorId: number
  productId: number
  productName?: string
  deviceClass?: number
  configurations?: Array<{ interfaces: Array<{ alternates: Array<{ interfaceClass: number }> }> }>
}
interface DispositivoHID extends DispositivoUSB {
  collections: Array<{ usagePage: number }>
}
interface PuertoSerial { getInfo: () => { usbVendorId?: number; usbProductId?: number } }
export interface NavegadorEquipos {
  usb?: EventTarget & { getDevices: () => Promise<DispositivoUSB[]>; requestDevice: (options: { filters: object[] }) => Promise<DispositivoUSB> }
  hid?: EventTarget & { getDevices: () => Promise<DispositivoHID[]> }
  serial?: EventTarget & { getPorts: () => Promise<PuertoSerial[]> }
}
export interface EquiposDetectados {
  impresora: Partial<EquiposComercio> | null
  lector: Partial<EquiposComercio> | null
  ambiguos: boolean
}
export type SeleccionEquiposUSB = Partial<Record<'impresora' | 'lector', { vendorId: number; productId: number }>>
export function leerSeleccionEquiposUSB(): SeleccionEquiposUSB {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('kioskopos_equipos_usb_puesto_v1') || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const seleccion: SeleccionEquiposUSB = {}
    for (const key of ['impresora', 'lector'] as const) {
      const dispositivo: unknown = (value as Record<string, unknown>)[key]
      if (!dispositivo || typeof dispositivo !== 'object') continue
      const ids = dispositivo as Record<string, unknown>
      if (typeof ids.vendorId === 'number' && Number.isInteger(ids.vendorId) && ids.vendorId >= 0 && ids.vendorId <= 65535
        && typeof ids.productId === 'number' && Number.isInteger(ids.productId) && ids.productId >= 0 && ids.productId <= 65535) {
        seleccion[key] = { vendorId: ids.vendorId, productId: ids.productId }
      }
    }
    return seleccion
  } catch { return {} }
}
const identidad = (d: DispositivoUSB) => `${d.vendorId.toString(16).padStart(4, '0')}:${d.productId.toString(16).padStart(4, '0')}`
export function datosEquipoUSB(d: DispositivoUSB, tipo: 'impresora' | 'lector'): Partial<EquiposComercio> {
  const modelo = d.productName?.trim().slice(0, 150) || `USB ${identidad(d)}`
  return tipo === 'impresora' ? { impresoraModelo: modelo, impresoraConexion: 'USB' }
    : { lectorModelo: modelo, lectorConexion: 'USB' }
}
export function completarEquiposVacios(actual: EquiposComercio, detectados: Partial<EquiposComercio>): EquiposComercio {
  const resultado = { ...actual }
  for (const key of Object.keys(detectados) as Array<keyof EquiposComercio>) {
    if (!actual[key].trim() && detectados[key]) resultado[key] = detectados[key]!
  }
  return resultado
}

/** Sólo inspecciona dispositivos autorizados; no abre puertos ni prueba protocolos. */
export async function detectarEquiposAutorizados(nav: NavegadorEquipos, puertoConfigurado: unknown,
  seleccion: SeleccionEquiposUSB = {}): Promise<EquiposDetectados> {
  const [usb, hid, serial] = await Promise.allSettled([
    nav.usb?.getDevices() ?? Promise.resolve([]), nav.hid?.getDevices() ?? Promise.resolve([]),
    nav.serial?.getPorts() ?? Promise.resolve([]),
  ])
  const dispositivos = usb.status === 'fulfilled' ? usb.value : []
  const elegidos = (tipo: 'impresora' | 'lector') => dispositivos.filter((d) => d.vendorId === seleccion[tipo]?.vendorId && d.productId === seleccion[tipo]?.productId)
  const impresoras = seleccion.impresora ? elegidos('impresora') : dispositivos.filter((d) => d.deviceClass === 7
    || d.configurations?.some((c) => c.interfaces.some((i) => i.alternates.some((a) => a.interfaceClass === 7))))
  const lectores = seleccion.lector ? elegidos('lector')
    : hid.status === 'fulfilled' ? hid.value.filter((d) => d.collections.some((c) => c.usagePage === 0x8c)) : []
  let impresora = impresoras.length === 1 ? datosEquipoUSB(impresoras[0], 'impresora') : null
  if (!impresora && puertoConfigurado && typeof puertoConfigurado === 'object'
    && 'usbVendorId' in puertoConfigurado && 'usbProductId' in puertoConfigurado && serial.status === 'fulfilled') {
    const puertos = serial.value.filter((p) => {
      const info = p.getInfo()
      return info.usbVendorId === puertoConfigurado.usbVendorId && info.usbProductId === puertoConfigurado.usbProductId
    })
    if (puertos.length === 1) {
      const info = puertos[0].getInfo()
      const dispositivo = dispositivos.find((d) => d.vendorId === info.usbVendorId && d.productId === info.usbProductId)
      impresora = { ...(dispositivo ? datosEquipoUSB(dispositivo, 'impresora') : {}), impresoraConexion: 'USB / serial' }
    }
  }
  return { impresora, lector: lectores.length === 1 ? { ...datosEquipoUSB(lectores[0], 'lector'),
    lectorConexion: seleccion.lector ? 'USB' : 'HID (navegador)' } : null,
    ambiguos: impresoras.length > 1 || lectores.length > 1 }
}
