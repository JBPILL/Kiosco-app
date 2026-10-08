import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useOfflineSyncStore, type VentaOfflinePendiente } from './offlineSyncStore'

const db = vi.hoisted(() => ({ llamadas: [] as string[], fallarProducto: false,
  conflictoServicio: false,
  perderRespuestaPago: false, pagos: new Map<string, unknown>() }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => ({
      upsert: (datos: unknown, opciones: unknown) => {
        db.llamadas.push(`${tabla}:upsert`)
        if (tabla === 'pagos_venta') {
          for (const pago of datos as Array<{ id: string }>) db.pagos.set(pago.id, pago)
          const error = db.perderRespuestaPago ? { message: 'Respuesta perdida después de guardar' } : null
          db.perderRespuestaPago = false
          return Promise.resolve({ error })
        }
        expect(datos).toEqual([expect.objectContaining({
          id: 'servicio', kiosco_id: 'k1', descripcion: 'Fotocopias', activo: false,
        })])
        expect(opciones).toEqual({ onConflict: 'id', ignoreDuplicates: true })
        return Promise.resolve({ error: db.fallarProducto ? { message: 'Sin conexión' } : null })
      },
      insert: () => {
        db.llamadas.push(`${tabla}:insert`)
        return Promise.resolve({ error: null })
      },
      select: (campos: string) => {
        expect(campos).toBe('id,kiosco_id,descripcion,precio_venta,activo')
        db.llamadas.push(`${tabla}:select`)
        return { eq: () => ({ in: async () => ({ error: null, data: [{
          id: 'servicio', kiosco_id: 'k1', descripcion: 'Fotocopias', activo: false,
          precio_venta: db.conflictoServicio ? 200 : 150,
        }] }) }) }
      },
    }),
  },
}))

beforeEach(() => {
  vi.stubEnv('VITE_AUDITORIA_MOTIVO_PRECIO', 'false')
  localStorage.clear()
  db.llamadas = []
  db.fallarProducto = false
  db.conflictoServicio = false
  db.perderRespuestaPago = false
  db.pagos.clear()
  useOfflineSyncStore.setState({ cola: [], sincronizando: false, ultimaSincronizacion: null })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

const venta: VentaOfflinePendiente = {
  id: 'v1', kiosco_id: 'k1', usuario_id: null, sesion_caja_id: null,
  fecha_hora: '2026-10-05T12:00:00Z', fecha_encolado: '2026-10-05T12:00:00Z',
  total: 150, estado: 'COMPLETADA', notas: null,
  detalles: [{ id: 'd1', producto_id: 'servicio', cantidad: 1, precio_unitario: 150,
    subtotal: 150, articulo_libre: { descripcion: 'Fotocopias', precio_venta: 150 } }],
  pagos: [{ medio_pago: 'EFECTIVO', monto: 150 }],
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

it.each([false, true])('auditoría activa verifica identidad y conserva cola ante conflicto=%s', async conflicto => {
  vi.stubEnv('VITE_AUDITORIA_MOTIVO_PRECIO', 'true')
  db.conflictoServicio = conflicto
  useOfflineSyncStore.getState().encolarVenta(venta)
  expect(await useOfflineSyncStore.getState().sincronizarCola('k1')).toEqual(conflicto
    ? { exitosas: 0, fallidas: 1 } : { exitosas: 1, fallidas: 0 })
  expect(db.llamadas.slice(0, 2)).toEqual(['productos:upsert', 'productos:select'])
  if (conflicto) {
    expect(db.llamadas).toHaveLength(2)
    expect(useOfflineSyncStore.getState().cargarCola('k1')).toEqual([venta])
  }
})

it('no confirma una venta offline cuando el almacenamiento está lleno', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Lleno', 'QuotaExceededError') })
  expect(() => useOfflineSyncStore.getState().encolarVenta(venta)).toThrow('No se pudo guardar')
  expect(useOfflineSyncStore.getState().cola).toEqual([])
})

it('no sobrescribe una cola dañada al encolar otra venta', () => {
  localStorage.setItem('kioskopos_cola_offline_k1', '{incompleto')
  expect(() => useOfflineSyncStore.getState().encolarVenta(venta)).toThrow('No se pudo leer')
  expect(localStorage.getItem('kioskopos_cola_offline_k1')).toBe('{incompleto')
})

it('libera el bloqueo de sincronización si no puede leer la cola persistida', async () => {
  localStorage.setItem('kioskopos_cola_offline_k1', '{}')
  await expect(useOfflineSyncStore.getState().sincronizarCola('k1')).rejects.toThrow('No se pudo leer')
  expect(useOfflineSyncStore.getState().sincronizando).toBe(false)
  expect(db.llamadas).toEqual([])
})

it('conserva la cola y no anuncia finalización si falla su escritura después del envío', async () => {
  useOfflineSyncStore.getState().encolarVenta(venta)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Lleno', 'QuotaExceededError') })
  await expect(useOfflineSyncStore.getState().sincronizarCola('k1')).rejects.toThrow('No se pudo guardar')
  expect(useOfflineSyncStore.getState().cargarCola('k1')).toEqual([venta])
  expect(useOfflineSyncStore.getState().sincronizando).toBe(false)
  expect(useOfflineSyncStore.getState().ultimaSincronizacion).toBeNull()
})

it('recupera el servicio almacenado y lo persiste antes de la venta sin tocar stock', async () => {
  useOfflineSyncStore.getState().encolarVenta(venta)
  useOfflineSyncStore.getState().cargarCola('k1')
  expect(await useOfflineSyncStore.getState().sincronizarCola('k1')).toEqual({ exitosas: 1, fallidas: 0 })
  expect(db.llamadas).toEqual(['productos:upsert', 'ventas:insert', 'detalles_venta:insert', 'pagos_venta:upsert'])
  expect(useOfflineSyncStore.getState().cargarCola('k1')).toEqual([])
})

it('reutiliza la identidad de cada pago si se pierde la respuesta y conserva pagos mixtos iguales', async () => {
  db.perderRespuestaPago = true
  useOfflineSyncStore.getState().encolarVenta({ ...venta, pagos: [
    { medio_pago: 'EFECTIVO', monto: 75 }, { medio_pago: 'EFECTIVO', monto: 75 },
  ] })
  expect(await useOfflineSyncStore.getState().sincronizarCola('k1')).toEqual({ exitosas: 0, fallidas: 1 })
  const idsOriginales = [...db.pagos.keys()]
  expect(idsOriginales).toHaveLength(2)
  useOfflineSyncStore.getState().cargarCola('k1')
  expect(await useOfflineSyncStore.getState().sincronizarCola('k1')).toEqual({ exitosas: 1, fallidas: 0 })
  expect([...db.pagos.keys()]).toEqual(idsOriginales)
})

it('conserva la venta pendiente si no puede crear el servicio', async () => {
  db.fallarProducto = true
  useOfflineSyncStore.getState().encolarVenta(venta)
  expect(await useOfflineSyncStore.getState().sincronizarCola('k1')).toEqual({ exitosas: 0, fallidas: 1 })
  expect(db.llamadas).toEqual(['productos:upsert'])
  expect(useOfflineSyncStore.getState().cargarCola('k1')).toEqual([venta])
})
