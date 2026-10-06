export class PointWorkerBodyError extends Error {
  readonly status: number
  constructor(status: number) {
    super('Solicitud inválida')
    this.status = status
  }
}

export async function leerCuerpoWorkerPoint(request: Request): Promise<unknown> {
  if (!request.body) return {}
  const reader = request.body.getReader()
  const partes: Uint8Array[] = []
  let longitud = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      longitud += value.length
      if (longitud > 1024) {
        await reader.cancel()
        throw new PointWorkerBodyError(413)
      }
      partes.push(value)
    }
    const bytes = new Uint8Array(longitud)
    let offset = 0
    for (const parte of partes) { bytes.set(parte, offset); offset += parte.length }
    return longitud ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown : {}
  } catch (error) {
    if (error instanceof PointWorkerBodyError) throw error
    throw new PointWorkerBodyError(400)
  } finally { reader.releaseLock() }
}
