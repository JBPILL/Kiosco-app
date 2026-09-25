import type { Producto } from '../types/database'

export interface ResultadoBalanza {
  esCodigoBalanza: boolean
  plu4: string
  plu4Corto: string
  plu5: string
  plu5Corto: string
  pluCorto: string
  pesoKg: number
  pesoGramos: number
  pesoKgPlu4: number
  pesoGramosPlu4: number
  pesoKgPlu5: number
  pesoGramosPlu5: number
  rawBarcode: string
}

/**
 * Parsea un código de barras de balanza comercial argentina (EAN-13 con prefijo 20 o 02).
 * Formatos estándar de balanzas Systel / Kretz / Toledo / San Salvador:
 * [20][PPPP][WWWWW][C]  -> PLU 4 dígitos + Peso 5 dígitos (en gramos) + Dígito verificador
 * [20][PPPPP][WWWWW][C] -> PLU 5 dígitos + Peso 5 dígitos (en gramos) + Dígito verificador
 */
export function parsearCodigoBalanza(codigo: string): ResultadoBalanza | null {
  if (!codigo) return null
  const limpio = codigo.trim()

  // Las balanzas comerciales emiten código EAN-13 (13 dígitos) que inicia con 20 o 02
  if (limpio.length !== 13 || (!limpio.startsWith('20') && !limpio.startsWith('02'))) {
    return null
  }

  // Opción 1: PLU de 4 dígitos (posiciones 2 a 6) y peso de 5 dígitos (posiciones 6 a 11)
  const plu4 = limpio.slice(2, 6)
  const gramosStr4 = limpio.slice(6, 11)
  const gramos4 = parseInt(gramosStr4, 10) || 0
  const pesoKgPlu4 = Number((gramos4 / 1000).toFixed(3))

  // Opción 2: PLU de 5 dígitos (posiciones 2 a 7) y peso de 5 dígitos (posiciones 7 a 12)
  const plu5 = limpio.slice(2, 7)
  const gramosStr5 = limpio.slice(7, 12)
  const gramos5 = parseInt(gramosStr5, 10) || 0
  const pesoKgPlu5 = Number((gramos5 / 1000).toFixed(3))

  // Peso por defecto con heurística de peso comercial seguro (evitar anomalías > 35 kg en balanza de mostrador)
  let pesoGramos = gramos4
  if (gramos4 > 35000 && gramos5 > 0 && gramos5 <= 35000) {
    pesoGramos = gramos5
  } else if (pesoGramos <= 0 && gramos5 > 0) {
    pesoGramos = gramos5
  }
  const pesoKg = Number((pesoGramos / 1000).toFixed(3))

  const plu4Corto = plu4.replace(/^0+/, '') || plu4
  const plu5Corto = plu5.replace(/^0+/, '') || plu5

  return {
    esCodigoBalanza: true,
    plu4,
    plu4Corto,
    plu5,
    plu5Corto,
    pluCorto: plu4Corto,
    pesoKg,
    pesoGramos,
    pesoKgPlu4,
    pesoGramosPlu4: gramos4,
    pesoKgPlu5,
    pesoGramosPlu5: gramos5,
    rawBarcode: limpio,
  }
}

/**
 * Busca en la lista de productos un artículo pesable coincidente con el código de balanza
 * y asocia exactamente el peso correspondiente al formato de PLU configurado en el producto.
 */
export function buscarProductoPorCodigoBalanza(
  codigo: string,
  productos: Producto[]
): { producto: Producto; pesoKg: number } | null {
  const parsed = parsearCodigoBalanza(codigo)
  if (!parsed) return null

  // 1. Prioridad: Buscar coincidencia por PLU de 5 dígitos
  for (const p of productos) {
    if (!p.activo) continue
    const pPlu = p.plu_balanza?.trim()
    const pPluLimpio = pPlu?.replace(/^0+/, '')
    const pCb = p.codigo_barras?.trim()
    const pCbLimpio = pCb?.replace(/^0+/, '')

    const coincidePlu5 =
      pPlu === parsed.plu5 ||
      pPluLimpio === parsed.plu5Corto ||
      pCb === parsed.plu5 ||
      pCbLimpio === parsed.plu5Corto

    if (coincidePlu5) {
      const pesoFinal = parsed.pesoKgPlu5 > 0 ? parsed.pesoKgPlu5 : 0.1
      return { producto: p, pesoKg: pesoFinal }
    }
  }

  // 2. Segunda prioridad: Buscar coincidencia por PLU de 4 dígitos
  for (const p of productos) {
    if (!p.activo) continue
    const pPlu = p.plu_balanza?.trim()
    const pPluLimpio = pPlu?.replace(/^0+/, '')
    const pCb = p.codigo_barras?.trim()
    const pCbLimpio = pCb?.replace(/^0+/, '')

    const coincidePlu4 =
      pPlu === parsed.plu4 ||
      pPluLimpio === parsed.plu4Corto ||
      pCb === parsed.plu4 ||
      pCbLimpio === parsed.plu4Corto

    if (coincidePlu4) {
      const pesoFinal = parsed.pesoKgPlu4 > 0 ? parsed.pesoKgPlu4 : 0.1
      return { producto: p, pesoKg: pesoFinal }
    }
  }

  // 3. Fallback: Coincidencia por código de barras completo escaneado
  const matchExacto = productos.find(
    (p) => p.activo && (p.codigo_barras === parsed.rawBarcode || p.plu_balanza === parsed.rawBarcode)
  )

  if (matchExacto) {
    const pesoFinal = parsed.pesoKg > 0 ? parsed.pesoKg : 0.1
    return {
      producto: matchExacto,
      pesoKg: pesoFinal,
    }
  }

  return null
}
