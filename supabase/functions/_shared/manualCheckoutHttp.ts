import type { ManualCheckoutDependencies, ContextoCheckoutManual } from './manualCheckout.ts'
import { cerrarCheckoutManual } from './manualCheckout.ts'
import { leerEntradaCheckoutManual } from './manualCheckoutRequest.ts'
import { leerCuerpo } from './pointQuoteHttp.ts'
import type { EntradaCheckoutManual } from '../../../src/types/checkoutManual.ts'

export interface ManualCheckoutHttpDependencies extends ManualCheckoutDependencies {
  origins: string[]
  autenticar: (token: string) => Promise<ContextoCheckoutManual | null>
}

export async function recibirCheckoutManual(request: Request, deps: ManualCheckoutHttpDependencies): Promise<Response> {
  const origin = request.headers.get('origin')
  if (origin && !deps.origins.includes(origin)) return new Response('Origen no autorizado', { status: 403 })
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  const responder = (status: number, codigo: string, error: string) => new Response(JSON.stringify({ codigo, error }), { status, headers })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return responder(405, 'METODO_INVALIDO', 'Método no permitido')
  const authorization = request.headers.get('authorization') || ''
  if (!/^Bearer \S+$/.test(authorization)) return responder(401, 'SESION_REQUERIDA', 'Sesión requerida')
  let contexto: ContextoCheckoutManual | null
  try { contexto = await deps.autenticar(authorization.slice(7)) }
  catch { return responder(503, 'AUTENTICACION_NO_DISPONIBLE', 'No se pudo verificar la sesión') }
  if (!contexto) return responder(401, 'SESION_INVALIDA', 'Sesión inválida')
  let entrada: EntradaCheckoutManual
  try { entrada = leerEntradaCheckoutManual(await leerCuerpo(request)) }
  catch { return responder(400, 'ENTRADA_INVALIDA', 'Solicitud de cobro inválida') }
  try {
    const resultado = await cerrarCheckoutManual(contexto, entrada, deps)
    return new Response(JSON.stringify(resultado), { status: 200, headers })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : ''
    if (mensaje === 'Se requiere autorización de supervisor') return responder(403, 'SUPERVISOR_REQUERIDO', mensaje)
    if (mensaje === 'Cobro no autorizado' || mensaje === 'Comercio sin cobros habilitados' || mensaje === 'Fecha no autorizada') {
      return responder(403, 'COBRO_NO_AUTORIZADO', 'Cobro no autorizado para esta sesión')
    }
    if (mensaje.startsWith('El ticket requiere revisión:')) return responder(422, 'REVISION_COMERCIAL', 'Revisá precios, promociones y recetas antes de confirmar')
    return responder(409, 'CIERRE_NO_CONFIRMADO', 'El cierre no quedó confirmado. Conservá la solicitud y reintentá con el mismo identificador; no vuelvas a cobrar al cliente.')
  }
}
