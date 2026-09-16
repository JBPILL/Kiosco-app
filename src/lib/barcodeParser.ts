import type { Producto } from '../types/database'

export interface ResultadoBalanza {
  esCodigoBalanza: boolean
  plu4: string
  plu5: string
  pluCorto: string
  pesoKg: number
  pesoGramos: number
  rawBarcode: string
}

/**
 * Parsea un código de barras de balanza comercial argentina (EAN-13 con prefijo 20 o 02).
 * Formato estándar:
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

  // Opción 2: PLU de 5 dígitos (posiciones 2 a 7) y peso de 5 dígitos (posiciones 7 a 12)
  const plu5 = limpio.slice(2, 7)
  const gramosStr5 = limpio.slice(7, 12)
  const gramos5 = parseInt(gramosStr5, 10) || 0

  // Por defecto en la mayoría de balanzas Systel / Kretz argentinas se usa 4 dígitos de PLU
  const pesoGramos = gramos4 > 0 ? gramos4 : gramos5
  const pesoKg = Number((pesoGramos / 1000).toFixed(3))

  return {
    esCodigoBalanza: true,
    plu4,
    plu5,
    pluCorto: plu4.replace(/^0+/, '') || plu4,
    pesoKg,
    pesoGramos,
    rawBarcode: limpio,
  }
}

/**
 * Busca en la lista de productos un artículo pesable coincidente con el código de balanza.
 */
export function buscarProductoPorCodigoBalanza(
  codigo: string,
  productos: Producto[]
): { producto: Producto; pesoKg: number } | null {
  const parsed = parsearCodigoBalanza(codigo)
  if (!parsed) return null

  // 1. Buscar coincidencia exacta por plu_balanza o código de barras
  const match = productos.find((p) => {
    if (!p.activo) return false
    // Si tiene configurado plu_balanza
    if (p.plu_balanza) {
      const pPlu = p.plu_balanza.trim()
      const pPluLimpio = pPlu.replace(/^0+/, '')
      if (
        pPlu === parsed.plu4 ||
        pPlu === parsed.plu5 ||
        pPluLimpio === parsed.pluCorto ||
        pPlu === parsed.rawBarcode
      ) {
        return true
      }
    }

    // Si tiene configurado el código_barras con el PLU
    if (p.codigo_barras) {
      const pCb = p.codigo_barras.trim()
      const pCbLimpio = pCb.replace(/^0+/, '')
      if (
        pCb === parsed.plu4 ||
        pCb === parsed.plu5 ||
        pCbLimpio === parsed.pluCorto ||
        pCb === parsed.rawBarcode
      ) {
        return true
      }
    }

    return false
  })

  if (match) {
    // Si se encontró el producto pero el peso extraído es 0, asignamos mínimo 1 gramo o 100g
    const pesoFinal = parsed.pesoKg > 0 ? parsed.pesoKg : 0.1
    return {
      producto: match,
      pesoKg: pesoFinal,
    }
  }

  return null
}
