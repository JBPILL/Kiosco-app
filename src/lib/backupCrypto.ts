const FORMATO_BACKUP_CIFRADO = 'KioskoPOS.backup.cifrado'
const VERSION_BACKUP_CIFRADO = 1
const ITERACIONES_PBKDF2 = 310_000
const LONGITUD_SAL = 16
const LONGITUD_IV = 12

interface SobreBackupCifrado {
  formato: typeof FORMATO_BACKUP_CIFRADO
  version: typeof VERSION_BACKUP_CIFRADO
  kdf: {
    nombre: 'PBKDF2'
    hash: 'SHA-256'
    iteraciones: number
    sal: string
  }
  cifrado: {
    nombre: 'AES-GCM'
    iv: string
  }
  datos: string
}

function obtenerCrypto(): Crypto {
  if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.getRandomValues) {
    throw new Error('Este navegador no permite cifrar backups. Usá una versión actual de Chrome, Edge o Firefox.')
  }
  return crypto
}

function validarClave(clave: string): void {
  if (clave.length < 12) {
    throw new Error('La contraseña del backup debe tener al menos 12 caracteres.')
  }
}

function bytesABase64(bytes: Uint8Array): string {
  const partes: string[] = []
  const tamanioBloque = 0x8000
  for (let inicio = 0; inicio < bytes.length; inicio += tamanioBloque) {
    partes.push(String.fromCharCode(...bytes.subarray(inicio, inicio + tamanioBloque)))
  }
  return btoa(partes.join(''))
}

function base64ABytes(base64: string): Uint8Array {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let indice = 0; indice < binario.length; indice += 1) {
    bytes[indice] = binario.charCodeAt(indice)
  }
  return bytes
}

async function derivarClave(clave: string, sal: Uint8Array, iteraciones: number): Promise<CryptoKey> {
  const cryptoApi = obtenerCrypto()
  const claveBase = await cryptoApi.subtle.importKey(
    'raw',
    new TextEncoder().encode(clave),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return cryptoApi.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(sal), iterations: iteraciones },
    claveBase,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function parsearSobre(contenido: string): SobreBackupCifrado | null {
  try {
    const valor: unknown = JSON.parse(contenido)
    if (!valor || typeof valor !== 'object') return null
    const sobre = valor as Partial<SobreBackupCifrado>
    if (
      sobre.formato !== FORMATO_BACKUP_CIFRADO ||
      sobre.version !== VERSION_BACKUP_CIFRADO ||
      sobre.kdf?.nombre !== 'PBKDF2' ||
      sobre.kdf.hash !== 'SHA-256' ||
      !Number.isInteger(sobre.kdf.iteraciones) ||
      sobre.kdf.iteraciones < 100_000 ||
      sobre.kdf.iteraciones > 1_000_000 ||
      typeof sobre.kdf.sal !== 'string' ||
      sobre.cifrado?.nombre !== 'AES-GCM' ||
      typeof sobre.cifrado.iv !== 'string' ||
      typeof sobre.datos !== 'string'
    ) return null
    return sobre as SobreBackupCifrado
  } catch {
    return null
  }
}

export function esBackupCifrado(contenido: string): boolean {
  return parsearSobre(contenido) !== null
}

export async function cifrarBackupJson(contenido: string, clave: string): Promise<string> {
  validarClave(clave)
  const cryptoApi = obtenerCrypto()
  const sal = cryptoApi.getRandomValues(new Uint8Array(LONGITUD_SAL))
  const iv = cryptoApi.getRandomValues(new Uint8Array(LONGITUD_IV))
  const claveDerivada = await derivarClave(clave, sal, ITERACIONES_PBKDF2)
  const datos = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv },
    claveDerivada,
    new TextEncoder().encode(contenido)
  )

  const sobre: SobreBackupCifrado = {
    formato: FORMATO_BACKUP_CIFRADO,
    version: VERSION_BACKUP_CIFRADO,
    kdf: {
      nombre: 'PBKDF2',
      hash: 'SHA-256',
      iteraciones: ITERACIONES_PBKDF2,
      sal: bytesABase64(sal),
    },
    cifrado: { nombre: 'AES-GCM', iv: bytesABase64(iv) },
    datos: bytesABase64(new Uint8Array(datos)),
  }
  return JSON.stringify(sobre)
}

export async function descifrarBackupJson(contenido: string, clave: string): Promise<string> {
  validarClave(clave)
  const sobre = parsearSobre(contenido)
  if (!sobre) throw new Error('El archivo no tiene un formato de backup cifrado compatible.')

  try {
    const claveDerivada = await derivarClave(clave, base64ABytes(sobre.kdf.sal), sobre.kdf.iteraciones)
    const datos = await obtenerCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64ABytes(sobre.cifrado.iv)) },
      claveDerivada,
      new Uint8Array(base64ABytes(sobre.datos))
    )
    return new TextDecoder().decode(datos)
  } catch {
    throw new Error('No se pudo descifrar el backup. Verificá la contraseña y el archivo.')
  }
}
