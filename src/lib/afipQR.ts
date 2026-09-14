import QRCode from 'qrcode'

export interface DatosQRAFIP {
  fecha: string // YYYY-MM-DD
  cuit: number | string // CUIT del emisor
  puntoVenta: number // Punto de venta (ej: 2)
  tipoComprobante: number // 11: Factura C, 6: Factura B, 1: Factura A
  numeroComprobante: number // Número correlativo de comprobante
  importe: number // Importe total
  moneda?: string // "PES"
  cotizacion?: number // 1
  tipoDocReceptor?: number // 99: Consumidor Final, 96: DNI, 80: CUIT
  nroDocReceptor?: number | string // 0 o DNI/CUIT
  tipoCodigoAutorizacion?: string // "E" para CAE
  codigoAutorizacion: number | string // CAE (14 dígitos)
}

/**
 * Construye la URL oficial de validación de AFIP según la Resolución General 4892.
 */
export function construirURLQRAFIP(datos: DatosQRAFIP): string {
  const cuitLimpio = parseInt(String(datos.cuit).replace(/\D/g, ''), 10) || 0
  const caeLimpio = parseInt(String(datos.codigoAutorizacion).replace(/\D/g, ''), 10) || 0
  const docRecLimpio = parseInt(String(datos.nroDocReceptor || 0).replace(/\D/g, ''), 10) || 0

  const payload = {
    ver: 1,
    fecha: datos.fecha.split('T')[0],
    cuit: cuitLimpio,
    ptoVta: Number(datos.puntoVenta),
    tipoCmp: Number(datos.tipoComprobante),
    nroCmp: Number(datos.numeroComprobante),
    importe: Number(datos.importe.toFixed(2)),
    moneda: datos.moneda || 'PES',
    ctz: datos.cotizacion || 1,
    tipoDocRec: datos.tipoDocReceptor !== undefined ? Number(datos.tipoDocReceptor) : 99,
    nroDocRec: docRecLimpio,
    tipoCodAut: datos.tipoCodigoAutorizacion || 'E',
    codAut: caeLimpio,
  }

  const jsonStr = JSON.stringify(payload)
  let base64 = ''
  if (typeof window !== 'undefined' && window.btoa) {
    base64 = window.btoa(unescape(encodeURIComponent(jsonStr)))
  } else {
    base64 = Buffer.from(jsonStr).toString('base64')
  }

  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`
}

/**
 * Genera una imagen Data URL (PNG base64) del código QR oficial de AFIP.
 */
export async function generarImagenQRAFIP(urlOTexto: string, ancho: number = 160): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(urlOTexto, {
      width: ancho,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
    return dataUrl
  } catch (err) {
    console.error('Error generando QR de AFIP:', err)
    return ''
  }
}
