import { construirOrdenPoint, type PointOrderInput } from './pointOrder.ts'

export interface PointPaymentSnapshot {
  id: string
  status: string
  amount: string | null
  paidAmount: string | null
  statusDetail: string | null
}

export interface PointOrderSnapshot {
  id: string
  status: string
  externalReference: string | null
  payments: PointPaymentSnapshot[]
  type: string | null
  accountId: string | null
  terminalId: string | null
  countryCode: string | null
}

/** No incluye el cuerpo del proveedor ni credenciales en mensajes de error. */
export class PointApiError extends Error {
  readonly httpStatus: number | null
  readonly resultadoIncierto: boolean
  constructor(httpStatus: number | null, resultadoIncierto: boolean) {
    super(httpStatus === null ? 'No se pudo confirmar la respuesta de Point' : `Point devolvió HTTP ${httpStatus}`)
    this.name = 'PointApiError'
    this.httpStatus = httpStatus
    this.resultadoIncierto = resultadoIncierto
  }
}

function objeto(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function leerOrden(value: unknown): PointOrderSnapshot {
  const orden = objeto(value)
  if (!orden || typeof orden.id !== 'string' || !orden.id || typeof orden.status !== 'string' || !orden.status) {
    throw new PointApiError(null, true)
  }
  const transactions = objeto(orden.transactions)
  const pagos = transactions?.payments
  if (!Array.isArray(pagos) || pagos.length === 0) throw new PointApiError(null, true)
  const payments = pagos.map((value): PointPaymentSnapshot => {
    const pago = objeto(value)
    if (!pago || typeof pago.id !== 'string' || !pago.id || typeof pago.status !== 'string' || !pago.status) {
      throw new PointApiError(null, true)
    }
    return { id: pago.id, status: pago.status, amount: typeof pago.amount === 'string' ? pago.amount : null,
      paidAmount: typeof pago.paid_amount === 'string' ? pago.paid_amount : null,
      statusDetail: typeof pago.status_detail === 'string' ? pago.status_detail : null }
  })
  const pointConfig = objeto(objeto(orden.config)?.point)
  return {
    id: orden.id, status: orden.status,
    externalReference: typeof orden.external_reference === 'string' ? orden.external_reference : null,
    payments,
    type: typeof orden.type === 'string' ? orden.type : null,
    accountId: typeof orden.user_id === 'string' ? orden.user_id
      : typeof orden.user_id === 'number' && Number.isSafeInteger(orden.user_id) ? String(orden.user_id) : null,
    terminalId: typeof pointConfig?.terminal_id === 'string' ? pointConfig.terminal_id : null,
    countryCode: typeof orden.country_code === 'string' ? orden.country_code : null,
  }
}

function validarOrderId(id: string): void {
  if (!/^ORD[A-Za-z0-9]{1,100}$/.test(id)) throw new Error('Identificador de orden Point inválido')
}

/** Uso exclusivo en servidor. El llamador valida usuario, comercio e intento. */
export class PointApiClient {
  private readonly accessToken: string
  private readonly solicitar: typeof fetch
  private readonly timeoutMs: number
  constructor(
    accessToken: string,
    solicitar: typeof fetch = fetch,
    timeoutMs = 15000,
  ) {
    if (!accessToken.trim() || /\s/.test(accessToken)) throw new Error('Credencial Point no configurada')
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Tiempo de espera inválido')
    this.accessToken = accessToken
    this.solicitar = solicitar
    this.timeoutMs = timeoutMs
  }

  private async request(path: string, method: string, headers: Record<string, string>, body?: unknown): Promise<PointOrderSnapshot> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.solicitar(`https://api.mercadopago.com${path}`, {
        method, signal: controller.signal, redirect: 'error',
        headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (!response.ok) throw new PointApiError(response.status, response.status >= 500 || response.status === 408 || response.status === 429)
      return leerOrden(await response.json())
    } catch (error) {
      if (error instanceof PointApiError) throw error
      throw new PointApiError(null, true)
    } finally {
      clearTimeout(timer)
    }
  }

  async crear(input: PointOrderInput): Promise<PointOrderSnapshot> {
    const orden = construirOrdenPoint(input)
    return this.request('/v1/orders', 'POST', { 'X-Idempotency-Key': orden.idempotencyKey }, orden.body)
  }

  async consultar(orderId: string): Promise<PointOrderSnapshot> {
    validarOrderId(orderId)
    return this.request(`/v1/orders/${orderId}`, 'GET', {})
  }

  async cancelar(orderId: string, claveCancelacion: string): Promise<PointOrderSnapshot> {
    validarOrderId(orderId)
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(claveCancelacion)) throw new Error('Clave de cancelación inválida')
    return this.request(`/v1/orders/${orderId}/cancel`, 'POST', {
      'X-Idempotency-Key': claveCancelacion, 'x-allow-cancelable-status': 'at_terminal',
    })
  }
}
