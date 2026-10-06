import type { Cliente, Kiosco, Usuario } from '../../../src/types/database.ts'
import { autorizarCotizacionPoint, validarCreditoCotizacionPoint } from './pointQuoteAuthorization.ts'
import type { PermisosCotizacionPoint } from './pointQuoteAuthorization.ts'
import { leerSolicitudCotizacionPoint } from './pointQuoteRequest.ts'
import type { SolicitudCotizacionPoint } from './pointQuoteRequest.ts'
import { cotizarCobroPoint } from './pointQuote.ts'
import type { DatosCotizacionPoint } from './pointQuote.ts'

export interface PointQuoteHttpDependencies {
  origins: string[]
  autenticar: (token: string) => Promise<{ authUserId: string; usuario: Usuario; kiosco: Kiosco } | null>
  cargarDatos: (permisos: PermisosCotizacionPoint, solicitud: SolicitudCotizacionPoint)
    => Promise<{ productos: DatosCotizacionPoint['productos']; promociones: DatosCotizacionPoint['promociones'];
      componentes?: DatosCotizacionPoint['componentes'];
      envases: DatosCotizacionPoint['envases']; cliente: Cliente | null }>
  ahora: () => Date
  iniciarCheckout?: (permisos: PermisosCotizacionPoint, solicitud: SolicitudCotizacionPoint)
    => Promise<{ orderId: string; estadoPersistido: string; total: number; montoPointCentavos: number }>
}

async function leerCuerpo(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('Cuerpo vacío')
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let texto = ''
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 200000) {
        await reader.cancel()
        throw new Error('Solicitud demasiado grande')
      }
      texto += decoder.decode(chunk.value, { stream: true })
    }
    texto += decoder.decode()
    return JSON.parse(texto)
  } finally { reader.releaseLock() }
}

export async function recibirCotizacionPoint(request: Request, deps: PointQuoteHttpDependencies): Promise<Response> {
  const origin = request.headers.get('origin')
  if (origin && !deps.origins.includes(origin)) return new Response('Origen no autorizado', { status: 403 })
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' }
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info'
  headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
  const responder = (estado: number, mensaje: string) => new Response(JSON.stringify({ error: mensaje }), { status: estado, headers })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return responder(405, 'Método no permitido')
  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ') || !authorization.slice(7).trim()) return responder(401, 'Sesión requerida')
  let permisos: PermisosCotizacionPoint
  try {
    const contexto = await deps.autenticar(authorization.slice(7))
    if (!contexto) return responder(401, 'Sesión inválida')
    permisos = autorizarCotizacionPoint(contexto.authUserId, contexto.usuario, contexto.kiosco)
  } catch { return responder(403, 'No autorizado para cotizar') }
  let solicitud: SolicitudCotizacionPoint
  try { solicitud = leerSolicitudCotizacionPoint(await leerCuerpo(request)) }
  catch { return responder(400, 'Solicitud de cotización inválida') }
  if (deps.iniciarCheckout) {
    try {
      const resultado = await deps.iniciarCheckout(permisos, solicitud)
      return new Response(JSON.stringify({ orderId: resultado.orderId, estadoPersistido: resultado.estadoPersistido,
        total: resultado.total, montoPointCentavos: resultado.montoPointCentavos }), { status: 200, headers })
    } catch { return responder(409, 'No se confirmó el inicio de cobro; recuperá el intento antes de volver a cobrar') }
  }
  let datos: Awaited<ReturnType<PointQuoteHttpDependencies['cargarDatos']>>
  try { datos = await deps.cargarDatos(permisos, solicitud) }
  catch { return responder(503, 'No se pudieron consultar los datos del comercio') }
  try {
    const resultado = cotizarCobroPoint(solicitud.lineas, solicitud.tipoAjuste, solicitud.valorAjuste,
      { ...datos, kioscoId: permisos.kioscoId, permiteServicios: permisos.permiteServicios,
        permiteAjustes: permisos.permiteAjustes, fecha: deps.ahora() }, solicitud.pagos, solicitud.clienteId)
    validarCreditoCotizacionPoint(permisos.kioscoId, solicitud.clienteId, datos.cliente,
      resultado.cobro.montoCuentaCorrienteCentavos)
    return new Response(JSON.stringify({ intentoId: solicitud.intentoId, checkoutId: solicitud.checkoutId,
      subtotal: resultado.ticket.subtotal, ajuste: resultado.ticket.ajuste, total: resultado.ticket.total,
      montoPointCentavos: resultado.cobro.montoPointCentavos,
      items: resultado.ticket.items.map((item) => ({ productoId: item.producto.id,
        descripcion: item.producto.descripcion, cantidad: item.cantidad, subtotal: item.subtotal,
        descuentoPromo: item.descuento_promo || 0, promoNombre: item.promo_nombre || null })),
    }), { status: 200, headers })
  } catch { return responder(422, 'El ticket requiere revisión: productos, envases, permisos o crédito') }
}
