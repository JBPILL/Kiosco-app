import { autorizarWorkerPoint } from './pointProcessorHttp.ts'
import type { ResumenDespachoPoint } from './pointDispatcher.ts'
import { leerCuerpoWorkerPoint, PointWorkerBodyError } from './pointWorkerBody.ts'

export async function recibirDespachoPoint(request: Request, deps: {
  secret: string
  ejecutar: () => Promise<ResumenDespachoPoint>
}): Promise<Response> {
  if (request.method !== 'POST') return new Response('Método no permitido', { status: 405 })
  if (deps.secret.length < 32) return new Response('Servicio no configurado', { status: 503 })
  if (!await autorizarWorkerPoint(request, deps.secret)) return new Response('No autorizado', { status: 401 })
  // La DB elige el trabajo; el llamador no puede indicar cuenta, URL ni importes.
  try {
    const cuerpo = await leerCuerpoWorkerPoint(request)
    if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo) || Object.keys(cuerpo).length) {
      return new Response('Solicitud inválida', { status: 400 })
    }
  } catch (error) {
    return new Response('Solicitud inválida', { status: error instanceof PointWorkerBodyError ? error.status : 400 })
  }
  try {
    return new Response(JSON.stringify(await deps.ejecutar()), { status: 200,headers: { 'Content-Type': 'application/json' } })
  } catch { return new Response('El despacho Point sigue pendiente', { status: 503 }) }
}
