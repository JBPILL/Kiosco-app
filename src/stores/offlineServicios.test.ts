import { beforeEach, expect, it, vi } from 'vitest'
import { useOfflineSyncStore, type VentaOfflinePendiente } from './offlineSyncStore'

const db = vi.hoisted(() => ({ llamadas: [] as string[], fallarProducto: false,
  perderRespuestaPago: false, pagos: new Map<string, unknown>() }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => ({
      upsert: (datos: unknown) => {
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
        return Promise.resolve({ error: db.fallarProducto ? { message: 'Sin conexión' } : null })
      },
      insert: () => {
        db.llamadas.push(`${tabla}:insert`)
        return Promise.resolve({ error: null })
      },
      select: () => { throw new Error('Un servicio no debe consultar stock') },
    }),
  },
}))

beforeEach(() => {
  localStorage.clear()
  db.llamadas = []
  db.fallarProducto = false
  db.perderRespuestaPago = false
  db.pagos.clear()
  useOfflineSyncStore.setState({ cola: [], sincronizando: false })
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
