import { identificarNotificacionPoint } from './pointWebhook.ts'

export interface PointNotificationReceipt {
  applicationId: string
  orderId: string
  requestId: string
  timestamp: string
}

interface Dependencies {
  secret: string
  applicationId: string
  guardar: (receipt: PointNotificationReceipt) => Promise<void>
}

/** Acusa recibo durable. El procesamiento financiero se realiza por separado. */
export async function recibirWebhookPoint(request: Request, deps: Dependencies): Promise<Response> {
  if (request.method !== 'POST') return new Response('Método no permitido', { status: 405, headers: { Allow: 'POST' } })
  if (!deps.secret || !/^[0-9]{1,100}$/.test(deps.applicationId)) return new Response('Servicio no configurado', { status: 503 })
  try {
    const orderId = await identificarNotificacionPoint(request, deps.secret)
    if (!orderId) return new Response('Notificación inválida', { status: 401 })
    // La validación anterior ya comprobó que ts aparece una sola vez.
    const timestamp = request.headers.get('x-signature')?.split(',')
      .map((part) => part.trim().split('='))
      .find(([key]) => key.toLowerCase() === 'ts')?.[1]?.trim()
    if (!timestamp) return new Response('Notificación inválida', { status: 401 })
    await deps.guardar({ applicationId: deps.applicationId, orderId,
      requestId: request.headers.get('x-request-id')?.trim() ?? '', timestamp })
    return new Response('Recibida', { status: 200 })
  } catch {
    // No confirmar recepción si la escritura falló: el proveedor puede reenviar.
    return new Response('No se pudo registrar la notificación', { status: 503 })
  }
}
