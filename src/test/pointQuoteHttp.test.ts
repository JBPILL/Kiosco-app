import { describe, expect, it, vi } from 'vitest'
import { recibirCotizacionPoint } from '../../supabase/functions/_shared/pointQuoteHttp'
import type { PointQuoteHttpDependencies } from '../../supabase/functions/_shared/pointQuoteHttp'
import { crearProducto } from './factories'

const id = '01234567-1234-1234-1234-0123456789ab'
const body = { intentoId: id, checkoutId: id, clienteId: null, tipoAjuste: 'NINGUNO', valorAjuste: 0,
  lineas: [{ tipo: 'PRODUCTO', id, productoId: id, cantidad: 1, sinEnvase: false }], pagos: [] }
function deps(): PointQuoteHttpDependencies {
  return { origins: ['https://pos.example'], ahora: () => new Date('2026-10-06T12:00:00Z'),
    autenticar: async () => ({ authUserId: 'auth-1', usuario: { id: 'u1', auth_user_id: 'auth-1',
      kiosco_id: 'k1', nombre: '', email: null, rol: 'DUEÑO', activo: true, fecha_creacion: '' },
      kiosco: { id: 'k1', nombre: '', direccion: null, telefono: null, fecha_creacion: '', estado_suscripcion: 'ACTIVO' } }),
    cargarDatos: vi.fn(async () => ({ productos: [crearProducto({ id, precio_costo: 999 })], promociones: [], envases: [], cliente: null })),
  }
}
function request(payload: unknown = body, token = 'token') {
  return new Request('https://functions.example/point-quote', { method: 'POST',
    headers: { authorization: `Bearer ${token}`, origin: 'https://pos.example' }, body: JSON.stringify(payload) })
}

describe('endpoint de cotización Point', () => {
  it('despacha el inicio autenticado sin recotizar intentos existentes en el manejador', async () => {
    const dependencia = deps()
    dependencia.iniciarCheckout = vi.fn(async () => ({ orderId: 'ORD123', estadoPersistido: 'PENDIENTE',
      total: 100, montoPointCentavos: 10000 }))
    const respuesta = await recibirCotizacionPoint(request(), dependencia)
    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toMatchObject({ orderId: 'ORD123', estadoPersistido: 'PENDIENTE' })
    expect(dependencia.cargarDatos).not.toHaveBeenCalled()
    expect(dependencia.iniciarCheckout).toHaveBeenCalledOnce()
  })
  it('cotiza con datos del servidor y no expone costos ni registros completos', async () => {
    const respuesta = await recibirCotizacionPoint(request(), deps())
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get('access-control-allow-origin')).toBe('https://pos.example')
    const texto = await respuesta.text()
    expect(JSON.parse(texto)).toMatchObject({ total: 100, montoPointCentavos: 10000 })
    expect(texto).not.toContain('precio_costo')
    expect(texto).not.toContain('999')
  })

  it('no consulta catálogo con sesión inválida o cuerpo manipulable', async () => {
    const dependencia = deps()
    dependencia.autenticar = async () => null
    expect((await recibirCotizacionPoint(request(), dependencia)).status).toBe(401)
    expect(dependencia.cargarDatos).not.toHaveBeenCalled()
    const otra = deps()
    expect((await recibirCotizacionPoint(request({ ...body, total: 1 }), otra)).status).toBe(400)
    expect(otra.cargarDatos).not.toHaveBeenCalled()
  })

  it('rechaza orígenes ajenos y falla sin devolver detalles internos', async () => {
    const dependencia = deps()
    dependencia.origins = []
    expect((await recibirCotizacionPoint(request(), dependencia)).status).toBe(403)
    const otra = deps()
    otra.cargarDatos = async () => { throw new Error('SECRET_DATABASE_ERROR') }
    const respuesta = await recibirCotizacionPoint(request(), otra)
    expect(respuesta.status).toBe(503)
    expect(await respuesta.text()).not.toContain('SECRET')
  })
})
