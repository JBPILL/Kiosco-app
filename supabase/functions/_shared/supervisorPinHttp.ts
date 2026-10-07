import type { ContextoCheckoutManual } from './manualCheckout.ts'
import type { DependenciasAutorizacionDescuento } from './supervisorDiscountAuthorization.ts'
import { autorizarDescuentoConPin } from './supervisorDiscountAuthorization.ts'
import { crearHashPinSupervisor, type HashPinSupervisor } from './supervisorPinCrypto.ts'
import { autorizarCotizacionPoint } from './pointQuoteAuthorization.ts'
import { leerCuerpo } from './pointQuoteHttp.ts'
import { camposManual, leerEntradaCheckoutManual, objetoManual } from './manualCheckoutRequest.ts'
import type { EntradaCheckoutManual } from '../../../src/types/checkoutManual.ts'

export interface DependenciasHttpSupervisor extends DependenciasAutorizacionDescuento {
  origins: string[]
  autenticar: (token: string) => Promise<ContextoCheckoutManual | null>
  consultarEstado: (kioscoId: string) => Promise<boolean>
  versionPepperActual: () => string
  configurar: (actorAuthId: string, hash: HashPinSupervisor) => Promise<void>
}

function pinValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[0-9]{4,6}$/.test(valor)
}

/** El actor/comercio se resuelven con JWT; el cuerpo nunca concede un rol. */
export async function recibirSupervisorPin(request: Request, deps: DependenciasHttpSupervisor): Promise<Response> {
  const origin = request.headers.get('origin')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
  const responder = (status: number, datos: object) => new Response(JSON.stringify(datos), { status, headers })
  if (origin && !deps.origins.includes(origin)) return responder(403, { error: 'Origen no autorizado' })
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return responder(405, { error: 'Método no permitido' })
  const authorization = request.headers.get('authorization') || ''
  if (!/^Bearer \S+$/.test(authorization)) return responder(401, { error: 'Sesión requerida' })
  let contexto: ContextoCheckoutManual | null
  try { contexto = await deps.autenticar(authorization.slice(7)) }
  catch { return responder(503, { error: 'No se pudo verificar la sesión' }) }
  if (!contexto) return responder(401, { error: 'Sesión inválida' })
  try { autorizarCotizacionPoint(contexto.authUserId, contexto.usuario, contexto.kiosco) }
  catch { return responder(403, { error: 'Operación no autorizada' }) }
  let cuerpo: Record<string, unknown>
  try { cuerpo = objetoManual(await leerCuerpo(request)) }
  catch { return responder(400, { error: 'Solicitud inválida' }) }
  if (cuerpo.accion === 'ESTADO') {
    try { camposManual(cuerpo, ['accion']) }
    catch { return responder(400, { error: 'Solicitud inválida' }) }
    try {
      const configurado = await deps.consultarEstado(contexto.kiosco.id)
      if (typeof configurado !== 'boolean') throw new Error('Estado inválido')
      return responder(200, { configurado })
    } catch { return responder(503, { error: 'No se pudo consultar el supervisor' }) }
  }
  if (cuerpo.accion === 'CONFIGURAR') {
    if (contexto.usuario.rol !== 'DUEÑO') return responder(403, { error: 'Sólo el dueño puede configurar el PIN' })
    try {
      camposManual(cuerpo, ['accion', 'pin', 'repetirPin'])
      if (!pinValido(cuerpo.pin) || cuerpo.pin !== cuerpo.repetirPin) throw new Error('PIN inválido')
    } catch { return responder(400, { error: 'Ingresá y repetí un PIN de 4 a 6 dígitos' }) }
    try {
      const version = deps.versionPepperActual()
      const pepper = await deps.obtenerPepper(version)
      const hash = await crearHashPinSupervisor(cuerpo.pin as string, contexto.kiosco.id, pepper, version)
      await deps.configurar(contexto.authUserId, hash)
      return responder(200, { estado: 'CONFIGURADO' })
    } catch { return responder(503, { error: 'No se pudo guardar el PIN de supervisor' }) }
  }
  if (cuerpo.accion === 'AUTORIZAR_DESCUENTO') {
    let entrada: EntradaCheckoutManual
    try {
      camposManual(cuerpo, ['accion', 'pin', 'entrada'])
      if (!pinValido(cuerpo.pin)) throw new Error('PIN inválido')
      entrada = leerEntradaCheckoutManual(cuerpo.entrada)
      if (!entrada.tipoAjuste.startsWith('DESCUENTO')) throw new Error('Acción inválida')
    } catch { return responder(400, { error: 'Solicitud de autorización inválida' }) }
    if (entrada.kioscoId !== contexto.kiosco.id || entrada.usuarioId !== contexto.usuario.id) {
      return responder(403, { error: 'La solicitud no corresponde a esta sesión' })
    }
    try {
      const resultado = await autorizarDescuentoConPin(contexto.authUserId, entrada, cuerpo.pin as string, deps)
      return responder(resultado.estado === 'BLOQUEADO' ? 429 : 200, resultado)
    } catch { return responder(503, { error: 'No se pudo confirmar la autorización' }) }
  }
  return responder(400, { error: 'Acción inválida' })
}
