import { beforeEach, expect, it, vi } from 'vitest'
import type { DatosReparacion } from '../types/electronica'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), identidad: { usuario: { id: 'u1', rol: 'DUEÑO', kiosco_id: 'k1' }, kiosco: { id: 'k1', rubro: 'ELECTRONICA_CELULARES', estado_suscripcion: 'ACTIVO' } } }))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('./authStore', () => ({ useAuthStore: { getState: () => mocks.identidad, subscribe: vi.fn() } }))
import { useElectronicaStore } from './electronicaStore'
let tablas: string[]
beforeEach(() => {
  vi.clearAllMocks()
  mocks.identidad.usuario = { id: 'u1', rol: 'DUEÑO', kiosco_id: 'k1' }
  mocks.identidad.kiosco = { id: 'k1', rubro: 'ELECTRONICA_CELULARES', estado_suscripcion: 'ACTIVO' }
  useElectronicaStore.getState().limpiar()
  tablas = []
  mocks.from.mockImplementation((tabla: string) => {
    tablas.push(tabla)
    const cadena = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), gte: vi.fn(), lte: vi.fn(), limit: vi.fn() }
    cadena.select.mockReturnValue(cadena); cadena.eq.mockReturnValue(cadena); cadena.order.mockReturnValue(cadena)
    cadena.gte.mockReturnValue(cadena); cadena.lte.mockReturnValue(cadena)
    cadena.range.mockResolvedValue({ data: [], error: null })
    cadena.limit.mockResolvedValue({ data: [{ id: 'v1', estado: 'COMPLETADA', sincronizado: true, detalles: [] }], error: null })
    return cadena
  })
  mocks.rpc.mockResolvedValue({ data: { id: 'registro', kiosco_id: 'k1' }, error: null })
})
const datosUnidad = { detalleVentaId: '11111111-1111-1111-1111-111111111111', tipo: 'SERIE' as const, identificador: 'ser1', garantiaHasta: null, condiciones: null }
const datosOrden: DatosReparacion = { cliente_nombre: 'Cliente', cliente_contacto: null, equipo: 'Equipo', identificador: null, informe_falla: 'Falla', diagnostico: null, estado: 'RECIBIDA', presupuesto: 100 }

it('usa sólo RPC de registro y lecturas; no toca stock, caja ni pagos', async () => {
  await useElectronicaStore.getState().registrarUnidad(datosUnidad, 'solicitud')
  expect(mocks.rpc).toHaveBeenCalledWith('electronica_registrar_unidad', expect.objectContaining({ p_solicitud_id: 'solicitud', p_identificador: 'SER1' }))
  expect(tablas).toEqual(['v_electronica_unidades', 'electronica_reparaciones'])
})
it('rechaza escritura de cajero y de otro rubro antes de tocar la red', async () => {
  mocks.identidad.usuario.rol = 'CAJERO'
  await expect(useElectronicaStore.getState().guardarReparacion(datosOrden, 's')).rejects.toThrow()
  mocks.identidad.usuario.rol = 'DUEÑO'; mocks.identidad.kiosco.rubro = 'KIOSCO'
  await expect(useElectronicaStore.getState().registrarUnidad(datosUnidad, 's')).rejects.toThrow()
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('reutiliza solicitud de reintento y no confirma un error remoto', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('Corte') })
  await expect(useElectronicaStore.getState().registrarUnidad(datosUnidad, 'misma')).rejects.toThrow()
  await useElectronicaStore.getState().registrarUnidad(datosUnidad, 'misma')
  expect(mocks.rpc.mock.calls.map(llamada => llamada[1].p_solicitud_id)).toEqual(['misma', 'misma'])
})
it('no entrega resultados de búsqueda de un comercio anterior', async () => {
  mocks.from.mockImplementation(() => {
    const cadena = { select: () => cadena, eq: () => cadena, gte: () => cadena, lte: () => cadena,
      limit: async () => {
        mocks.identidad.usuario.kiosco_id = 'k2'; mocks.identidad.kiosco.id = 'k2'
        return { data: [{ estado: 'COMPLETADA', sincronizado: true }], error: null }
      } }
    return cadena
  })
  await expect(useElectronicaStore.getState().buscarVenta('12345678')).rejects.toThrow('Cambió el comercio')
})
it('una orden no cobra y transmite la versión para actualización concurrente', async () => {
  await useElectronicaStore.getState().guardarReparacion(datosOrden, 's')
  expect(mocks.rpc).toHaveBeenCalledWith('electronica_guardar_reparacion', expect.objectContaining({ p_version: null, p_reparacion_id: null, p_datos: datosOrden }))
  expect(tablas).toEqual(['v_electronica_unidades', 'electronica_reparaciones'])
})
it('no confirma respuestas faltantes o de otro comercio', async () => {
  mocks.rpc.mockResolvedValue({ data: { id: 'registro', kiosco_id: 'k2' }, error: null })
  await expect(useElectronicaStore.getState().registrarUnidad(datosUnidad, 's')).rejects.toThrow('no confirmó')
})
it('permite leer pero no escribir con suscripción en modo lectura', async () => {
  mocks.identidad.kiosco.estado_suscripcion = 'SOLO_LECTURA'
  await useElectronicaStore.getState().cargar()
  await expect(useElectronicaStore.getState().registrarUnidad(datosUnidad, 's')).rejects.toThrow('modo de lectura')
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('descarta listas pendientes al cambiar de comercio', async () => {
  let responder: (datos: { data: Array<{ id: string; kiosco_id: string }>; error: null }) => void = () => {}
  const pendiente = new Promise<{ data: Array<{ id: string; kiosco_id: string }>; error: null }>(resolve => { responder = resolve })
  mocks.from.mockImplementation(() => {
    const cadena = { select: () => cadena, eq: () => cadena, order: () => cadena, range: () => pendiente }
    return cadena
  })
  const carga = useElectronicaStore.getState().cargar()
  mocks.identidad.usuario.kiosco_id = 'k2'; mocks.identidad.kiosco.id = 'k2'
  useElectronicaStore.getState().limpiar()
  responder({ data: [{ id: 'secreto', kiosco_id: 'k1' }], error: null })
  await carga
  expect(useElectronicaStore.getState().unidades).toEqual([])
  expect(useElectronicaStore.getState().reparaciones).toEqual([])
})
it('lee páginas completas sin presentar un límite de filas como total', async () => {
  mocks.from.mockImplementation(() => {
    const cadena = { select: () => cadena, eq: () => cadena, order: () => cadena,
      range: async (desde: number) => ({ data: Array.from({ length: desde === 0 ? 500 : 2 }, (_, i) => ({ id: String(desde + i), kiosco_id: 'k1' })), error: null }) }
    return cadena
  })
  await useElectronicaStore.getState().cargar()
  expect(useElectronicaStore.getState().unidades).toHaveLength(502)
  expect(useElectronicaStore.getState().reparaciones).toHaveLength(502)
})
