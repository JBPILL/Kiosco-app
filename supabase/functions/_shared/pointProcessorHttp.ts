interface PointProcessorHttpDependencies {
  secret: string
  ejecutar: (notificationId: string) => Promise<{ estadoPersistido: string; estadoEvaluado: string }>
}

async function claveValida(received: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([received, expected].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))))
  const bytesA = new Uint8Array(a)
  const bytesB = new Uint8Array(b)
  let diferencia = 0
  for (let i = 0; i < bytesA.length; i++) diferencia |= bytesA[i] ^ bytesB[i]
  return diferencia === 0
}

export async function recibirProcesoPoint(request: Request, deps: PointProcessorHttpDependencies): Promise<Response> {
  if (request.method !== 'POST') return new Response('Método no permitido', { status: 405 })
  if (deps.secret.length < 32) return new Response('Servicio no configurado', { status: 503 })
  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ') || !await claveValida(authorization.slice(7), deps.secret)) {
    return new Response('No autorizado', { status: 401 })
  }
  let body: unknown
  try { body = await request.json() } catch { return new Response('Solicitud inválida', { status: 400 }) }
  if (!body || typeof body !== 'object' || !('notificationId' in body) || typeof body.notificationId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.notificationId)) {
    return new Response('Identificador inválido', { status: 400 })
  }
  try {
    const resultado = await deps.ejecutar(body.notificationId)
    return new Response(JSON.stringify(resultado), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch {
    return new Response('La notificación sigue pendiente de procesamiento', { status: 503 })
  }
}
