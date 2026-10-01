/**
 * Utilidades para validación y formateo de documentos de identidad argentinos (DNI y CUIT/CUIL)
 * Algoritmo oficial Módulo 11 de AFIP / ARCA.
 */

const PREFIJOS_CUIT_VALIDOS = ['20', '23', '24', '27', '30', '33', '34']
const COEFICIENTES_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

/**
 * Limpia cualquier caracter no numérico de un documento.
 */
export function limpiarDocumento(doc?: string | null): string {
  if (!doc) return ''
  return String(doc).replace(/\D/g, '')
}

/**
 * Valida un CUIT o CUIL argentino utilizando el Algoritmo Módulo 11 oficial de AFIP / ARCA.
 * @param cuitStr Cadena con el CUIT (puede contener guiones, puntos o espacios)
 * @returns true si el CUIT es válido
 */
export function validarCUIT(cuitStr?: string | null): boolean {
  const clean = limpiarDocumento(cuitStr)
  if (clean.length !== 11) return false

  const tipo = clean.slice(0, 2)
  if (!PREFIJOS_CUIT_VALIDOS.includes(tipo)) return false

  let suma = 0
  for (let i = 0; i < 10; i++) {
    suma += parseInt(clean[i], 10) * COEFICIENTES_CUIT[i]
  }

  const resto = suma % 11
  let digitoEsperado = 11 - resto
  if (digitoEsperado === 11) digitoEsperado = 0
  else if (digitoEsperado === 10) digitoEsperado = 9

  return parseInt(clean[10], 10) === digitoEsperado
}

/**
 * Valida un DNI argentino (numérico, entre 7 y 8 dígitos).
 */
export function validarDNI(dniStr?: string | null): boolean {
  const clean = limpiarDocumento(dniStr)
  if (clean.length < 7 || clean.length > 8) return false
  const num = parseInt(clean, 10)
  return !isNaN(num) && num >= 1_000_000 && num <= 99_999_999
}

/**
 * Formatea un CUIT como XX-XXXXXXXX-X.
 * Si no tiene 11 dígitos, devuelve la cadena limpia.
 */
export function formatearCUIT(cuitStr?: string | null): string {
  const clean = limpiarDocumento(cuitStr)
  if (clean.length === 11) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`
  }
  return clean
}

export interface ResultadoValidacionDoc {
  valido: boolean
  tipo: 'DNI' | 'CUIT' | 'CONSUMIDOR_FINAL' | 'OTRO'
  valorLimpio: string
  mensaje?: string
}

/**
 * Validador inteligente de documento de cliente o proveedor.
 * Detecta automáticamente si es DNI (7-8 dígitos) o CUIT (11 dígitos) o valida según el tipo AFIP.
 */
export function validarDocumentoArgentino(
  documento?: string | null,
  tipoDocAFIP?: number
): ResultadoValidacionDoc {
  const limpio = limpiarDocumento(documento)

  if (!limpio) {
    if (tipoDocAFIP === 99 || tipoDocAFIP === undefined) {
      return { valido: true, tipo: 'CONSUMIDOR_FINAL', valorLimpio: '' }
    }
    return {
      valido: false,
      tipo: 'OTRO',
      valorLimpio: '',
      mensaje: 'El número de documento es obligatorio para facturación con datos.',
    }
  }

  // Validación explícita según código AFIP
  if (tipoDocAFIP === 80) {
    // 80 = CUIT
    if (limpio.length !== 11) {
      return {
        valido: false,
        tipo: 'CUIT',
        valorLimpio: limpio,
        mensaje: `El CUIT debe tener 11 dígitos (ingresaste ${limpio.length}).`,
      }
    }
    const esValido = validarCUIT(limpio)
    return {
      valido: esValido,
      tipo: 'CUIT',
      valorLimpio: limpio,
      mensaje: esValido
        ? undefined
        : 'El CUIT ingresado no es válido según el dígito verificador (Algoritmo Módulo 11 de AFIP).',
    }
  }

  if (tipoDocAFIP === 96) {
    // 96 = DNI
    const esValido = validarDNI(limpio)
    return {
      valido: esValido,
      tipo: 'DNI',
      valorLimpio: limpio,
      mensaje: esValido
        ? undefined
        : 'El DNI debe contener 7 u 8 dígitos numéricos válidos.',
    }
  }

  // Si no se especificó tipo AFIP, autodetectar según longitud
  if (limpio.length === 11) {
    const esValido = validarCUIT(limpio)
    return {
      valido: esValido,
      tipo: 'CUIT',
      valorLimpio: limpio,
      mensaje: esValido
        ? undefined
        : 'CUIT inválido: no coincide el dígito verificador oficial de AFIP (Módulo 11).',
    }
  }

  if (limpio.length === 7 || limpio.length === 8) {
    const esValido = validarDNI(limpio)
    return {
      valido: esValido,
      tipo: 'DNI',
      valorLimpio: limpio,
      mensaje: esValido
        ? undefined
        : 'DNI inválido: verifique el número ingresado.',
    }
  }

  return {
    valido: false,
    tipo: 'OTRO',
    valorLimpio: limpio,
    mensaje: 'Debe ingresar un DNI (7-8 dígitos) o un CUIT comercial (11 dígitos).',
  }
}
