export interface PointSignatureInput {
  orderId: string
  xSignature: string | null
  xRequestId: string | null
}

/** Verifica identidad firmada. No acredita el importe ni el estado del pago. */
export async function verificarFirmaPoint(input: PointSignatureInput, secret: string): Promise<boolean> {
  if (!secret || !/^ORD[A-Za-z0-9]{1,100}$/.test(input.orderId) || !input.xSignature || input.xSignature.length > 1024) return false
  const partes = input.xSignature.split(',').map((parte) => parte.trim().split('='))
  const timestamps = partes.filter(([key]) => key.toLowerCase() === 'ts')
  const firmas = partes.filter(([key]) => key.toLowerCase() === 'v1')
  if (timestamps.length !== 1 || firmas.length !== 1 || timestamps[0].length !== 2 || firmas[0].length !== 2) return false
  const ts = timestamps[0][1]?.trim()
  const firma = firmas[0][1]?.trim()
  if (!ts || !/^\d{1,16}$/.test(ts) || !firma || !/^[a-f0-9]{64}$/i.test(firma)) return false
  const requestId = input.xRequestId?.trim()
  if (requestId && !/^[A-Za-z0-9_-]{1,200}$/.test(requestId)) return false
  const manifest = `id:${input.orderId};${requestId ? `request-id:${requestId};` : ''}ts:${ts};`
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const bytes = Uint8Array.from(firma.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16))
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(manifest))
}

/** Devuelve exclusivamente el ID firmado; el cuerpo nunca confirma una venta. */
export async function identificarNotificacionPoint(request: Request, secret: string): Promise<string | null> {
  if (request.method !== 'POST') return null
  const url = new URL(request.url)
  const ids = url.searchParams.getAll('data.id')
  if (ids.length !== 1) return null
  const orderId = ids[0]
  if (!await verificarFirmaPoint({ orderId, xSignature: request.headers.get('x-signature'),
    xRequestId: request.headers.get('x-request-id') }, secret)) return null
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || !('type' in body) || body.type !== 'order'
      || !('data' in body) || !body.data || typeof body.data !== 'object'
      || !('id' in body.data) || body.data.id !== orderId) return null
    return orderId
  } catch {
    return null
  }
}
