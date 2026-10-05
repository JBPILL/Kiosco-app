/** Identidad reproducible para importar registros sin duplicarlos al reintentar. */
export async function identidadRestaurada(
  origen: string, destino: string, tabla: 'promociones' | 'lotes_producto', id: string,
): Promise<string> {
  if (!origen || !destino || !id) throw new Error('Falta la identidad original del registro o del comercio.')
  if (origen === destino) return id
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['KioskoPOS/backup/v1', origen, destino, tabla, id])))
  const bytes = new Uint8Array(digest).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
