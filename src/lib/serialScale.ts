/**
 * Módulo de Comunicación con Balanzas Electrónicas Comerciales vía Web Serial API
 * Compatible con balanzas de mostrador comunes en Argentina y Latinoamérica
 * (Systel Cuora/Croma, Kretz Report/Aura, Moretti, Toledo, Torrey, etc.)
 */

import { isWebSerialSupported } from './escposPrinter'

/**
 * Parsea tramas de texto enviadas por balanzas comerciales y extrae el peso en Kilogramos.
 * Maneja tramas de peso continuo o bajo demanda:
 * - "ST,GS,+01.250kg" -> 1.250
 * - "01.250\r\n" -> 1.250
 * - "P 000.450 kg" -> 0.450
 * - "=00450" (gramos) -> 0.450
 */
export function extraerPesoDesdeTrama(trama: string): number | null {
  if (!trama || typeof trama !== 'string') return null

  // 1. Coincidencia con decimales y unidad kg (ej: "+01.250kg", "1.250 kg", "0.350")
  const matchDecimal = trama.match(/([0-9]{1,3}\.[0-9]{2,3})\s*(?:kg)?/i)
  if (matchDecimal) {
    const val = parseFloat(matchDecimal[1])
    if (!isNaN(val) && val >= 0 && val < 500) {
      return Number(val.toFixed(3))
    }
  }

  // 2. Coincidencia con números enteros en gramos (ej: "450g", "1250 gr")
  const matchGramos = trama.match(/([0-9]{2,5})\s*g(?:r)?\b/i)
  if (matchGramos) {
    const valGr = parseInt(matchGramos[1], 10)
    if (!isNaN(valGr) && valGr > 0) {
      return Number((valGr / 1000).toFixed(3))
    }
  }

  // 3. Tramas Kretz fijas (ej: "N001250" donde son 6 dígitos con 3 decimales implícitos)
  const matchKretz = trama.match(/[A-Z]?0*([0-9]{1,6})\r?/i)
  if (matchKretz && matchKretz[1].length >= 3) {
    const rawNum = parseInt(matchKretz[1], 10)
    // Si parece una lectura de balanza comercial (hasta 60kg = 60000g)
    if (rawNum > 0 && rawNum <= 60000) {
      return Number((rawNum / 1000).toFixed(3))
    }
  }

  return null
}

export interface LecturaBalanzaResult {
  ok: boolean
  pesoKg?: number
  mensaje: string
}

/**
 * Conecta a una balanza por Web Serial, envía una petición de peso (polling)
 * o espera la transmisión continua, y devuelve la lectura en kg.
 */
export async function leerPesoBalanzaSerial(baudRate = 9600): Promise<LecturaBalanzaResult> {
  if (!isWebSerialSupported()) {
    return {
      ok: false,
      mensaje: 'Web Serial no está disponible en este navegador. Usá Chrome o Edge.',
    }
  }

  let port: any = null
  let reader: any = null

  try {
    const serial = (navigator as any).serial
    port = await serial.requestPort()
    await port.open({
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferSize: 1024,
    })

    // Intentar enviar comando de sondeo estándar (ENQ o 'P\r\n') por si la balanza no transmite en continuo
    try {
      if (port.writable) {
        const writer = port.writable.getWriter()
        const encoder = new TextEncoder()
        // Petición estándar ASCII de lectura para balanzas Systel/Kretz/Toledo
        await writer.write(encoder.encode('P\r\n'))
        writer.releaseLock()
      }
    } catch {
      // Ignorar si el puerto no acepta escritura o no la requiere
    }

    if (!port.readable) {
      throw new Error('El puerto serie no permite lectura.')
    }

    // BUG-03: Usar getReader() directamente en lugar de pipeTo() para evitar que
    // el ReadableStream quede bloqueado con un lock activo al cerrar el puerto.
    reader = port.readable.getReader()
    const textDecoder = new TextDecoder()

    let buffer = ''
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))

    // Bucle de lectura de trama
    const readPromise = (async () => {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          // Decodificar chunk de bytes a string (mode stream para multi-byte correctamente)
          buffer += textDecoder.decode(value, { stream: true })
          const peso = extraerPesoDesdeTrama(buffer)
          if (peso !== null && peso > 0) {
            return peso
          }
        }
      }
      return null
    })()

    const pesoObtenido = await Promise.race([readPromise, timeoutPromise])

    if (pesoObtenido !== null && pesoObtenido !== undefined) {
      return {
        ok: true,
        pesoKg: pesoObtenido,
        mensaje: `Peso leído con éxito: ${pesoObtenido.toFixed(3)} kg`,
      }
    } else {
      return {
        ok: false,
        mensaje: 'No se recibió una lectura estable de la balanza. Verificá que el plato no esté vacío ni oscilando.',
      }
    }
  } catch (err: unknown) {
    const error = err as Error
    if (error.name === 'NotFoundError') {
      return { ok: false, mensaje: 'Selección de balanza cancelada.' }
    }
    return {
      ok: false,
      mensaje: `Error al leer la balanza: ${error.message || 'Error de puerto'}`,
    }
  } finally {
    // BUG-03: Primero cancelar el reader para liberar el lock sobre port.readable,
    // luego cerrar el puerto. El orden importa — close() falla si readable aún tiene lock.
    try {
      await reader?.cancel()
    } catch {}
    try {
      reader?.releaseLock()
    } catch {}
    try {
      await port?.close()
    } catch {}
  }
}
