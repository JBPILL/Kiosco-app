/** Sólo servidor: el pepper debe venir del gestor de secretos, nunca del cliente. */
export interface HashPinSupervisor {
  version: 1
  algoritmo: 'PBKDF2-SHA256'
  iteraciones: 600000
  sal: string
  hash: string
  pepperVersion: string
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hex = (datos: Uint8Array): string => Array.from(datos, byte => byte.toString(16).padStart(2, '0')).join('')
function validar(pin: string, kioscoId: string, pepper: Uint8Array, pepperVersion: string): void {
  if (typeof pin !== 'string' || !/^[0-9]{4,6}$/.test(pin) || typeof kioscoId !== 'string' || !uuid.test(kioscoId)
    || !(pepper instanceof Uint8Array) || pepper.byteLength !== 32 || typeof pepperVersion !== 'string'
    || !/^[a-zA-Z0-9_-]{1,32}$/.test(pepperVersion)) throw new Error('Configuración de PIN inválida')
}
async function derivar(pin: string, kioscoId: string, pepper: Uint8Array, sal: Uint8Array): Promise<Uint8Array> {
  const clavePepper = await crypto.subtle.importKey('raw', new Uint8Array(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const material = await crypto.subtle.sign('HMAC', clavePepper, new TextEncoder().encode(`kiosko-supervisor:v1:${kioscoId.toLowerCase()}:${pin}`))
  const clave = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(sal), iterations: 600000 }, clave, 256))
}
export async function crearHashPinSupervisor(pin: string, kioscoId: string, pepper: Uint8Array, pepperVersion: string): Promise<HashPinSupervisor> {
  validar(pin, kioscoId, pepper, pepperVersion)
  const sal = crypto.getRandomValues(new Uint8Array(16))
  return { version: 1, algoritmo: 'PBKDF2-SHA256', iteraciones: 600000, sal: hex(sal),
    hash: hex(await derivar(pin, kioscoId, pepper, sal)), pepperVersion }
}
export async function verificarPinSupervisor(pin: string, kioscoId: string, pepper: Uint8Array, pepperVersion: string, registro: unknown): Promise<boolean> {
  validar(pin, kioscoId, pepper, pepperVersion)
  if (!registro || typeof registro !== 'object' || Array.isArray(registro)) throw new Error('Hash de PIN inválido')
  const datos = registro as Record<string, unknown>
  if (Object.keys(datos).length !== 6 || datos.version !== 1 || datos.algoritmo !== 'PBKDF2-SHA256' || datos.iteraciones !== 600000
    || datos.pepperVersion !== pepperVersion || typeof datos.sal !== 'string' || !/^[0-9a-f]{32}$/.test(datos.sal)
    || typeof datos.hash !== 'string' || !/^[0-9a-f]{64}$/.test(datos.hash)) throw new Error('Hash de PIN inválido')
  const sal = Uint8Array.from(datos.sal.match(/../g)!, byte => parseInt(byte, 16))
  const esperado = Uint8Array.from(datos.hash.match(/../g)!, byte => parseInt(byte, 16))
  const obtenido = await derivar(pin, kioscoId, pepper, sal)
  let diferencia = 0
  for (let i = 0; i < esperado.length; i++) diferencia |= esperado[i] ^ obtenido[i]
  return diferencia === 0
}
