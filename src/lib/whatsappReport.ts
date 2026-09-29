/**
 * Módulo de Notificaciones y Reportes de Cierre de Caja a WhatsApp y Webhook
 * Permite notificar al dueño del comercio al instante vía HTTP Webhook (n8n, Make, Evolution API, Baileys)
 * y generar enlaces directos a WhatsApp (wa.me) con formato profesional para auditoría de caja.
 */

import { formatPrecio, formatFecha } from './utils'
import type { DatosCierreCaja } from '../components/pos/TicketCierreCajaModal'

export interface WhatsAppReportConfig {
  whatsappDueno: string
  webhookUrl: string
  webhookToken: string
  autoAbrirWhatsApp: boolean
  habilitado: boolean
}

const STORAGE_PREFIX = 'kioskopos_whatsapp_report_'

/**
 * Obtiene la configuración de notificaciones para un kiosco
 */
export function getWhatsAppReportConfig(kioscoId?: string | null): WhatsAppReportConfig {
  const defaultConfig: WhatsAppReportConfig = {
    whatsappDueno: '',
    webhookUrl: '',
    webhookToken: '',
    autoAbrirWhatsApp: false,
    habilitado: true,
  }

  if (!kioscoId || typeof window === 'undefined') {
    return defaultConfig
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${kioscoId}`)
    if (!raw) return defaultConfig
    const parsed = JSON.parse(raw)
    return {
      whatsappDueno: typeof parsed.whatsappDueno === 'string' ? parsed.whatsappDueno : '',
      webhookUrl: typeof parsed.webhookUrl === 'string' ? parsed.webhookUrl : '',
      webhookToken: typeof parsed.webhookToken === 'string' ? parsed.webhookToken : '',
      autoAbrirWhatsApp: Boolean(parsed.autoAbrirWhatsApp),
      habilitado: parsed.habilitado !== undefined ? Boolean(parsed.habilitado) : true,
    }
  } catch (err) {
    console.warn('Error leyendo configuración de WhatsApp Report:', err)
    return defaultConfig
  }
}

/**
 * Guarda la configuración de notificaciones para un kiosco
 */
export function saveWhatsAppReportConfig(
  kioscoId: string,
  config: Partial<WhatsAppReportConfig>
): WhatsAppReportConfig {
  const actual = getWhatsAppReportConfig(kioscoId)
  const actualizada: WhatsAppReportConfig = {
    ...actual,
    ...config,
  }

  if (typeof window !== 'undefined' && kioscoId) {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${kioscoId}`, JSON.stringify(actualizada))
    } catch (err) {
      console.error('Error guardando configuración de WhatsApp Report en localStorage:', err)
    }
  }

  return actualizada
}

/**
 * Sanitiza y normaliza un número telefónico para WhatsApp.
 * Soporta números de todo el país (AMBA e Interior) y códigos internacionales:
 * - '011 15-2345-6789'  -> '5491123456789'
 * - '0351 15-234-5678'  -> '5493512345678'
 * - '03492 15-23-4567'  -> '5493492234567'
 * - '11 2345 6789'      -> '5491123456789'
 * - '+54 9 11 23456789' -> '5491123456789'
 * - '+598 99 123 456'   -> '59899123456' (Uruguay)
 */
export function sanitizarNumeroWhatsApp(numero: string): string {
  if (!numero) return ''
  // Eliminar todo caracter no numérico
  let digitos = numero.replace(/\D/g, '')
  if (!digitos) return ''

  // Si empieza con 0 (ej: 011..., 0351...), remover el 0 inicial
  if (digitos.startsWith('0')) {
    digitos = digitos.slice(1)
  }

  let esArgentina = false
  let nacional = digitos

  if (digitos.startsWith('54')) {
    esArgentina = true
    if (digitos.startsWith('549')) {
      nacional = digitos.slice(3)
    } else {
      nacional = digitos.slice(2)
    }
  } else if (digitos.length === 10 || digitos.length === 12) {
    esArgentina = true
    nacional = digitos
  }

  if (esArgentina) {
    // Si contiene el prefijo '15' móvil tradicional:
    if (nacional.length === 12) {
      if (nacional.slice(2, 4) === '15') {
        // AMBA (código 11 + 15 + 8 dígitos)
        nacional = nacional.slice(0, 2) + nacional.slice(4)
      } else if (nacional.slice(3, 5) === '15') {
        // Provincias capitales (ej: 351, 341 + 15 + 7 dígitos)
        nacional = nacional.slice(0, 3) + nacional.slice(5)
      } else if (nacional.slice(4, 6) === '15') {
        // Ciudades interior (ej: 3492 + 15 + 6 dígitos)
        nacional = nacional.slice(0, 4) + nacional.slice(6)
      }
    }
    return '549' + nacional
  }

  return digitos
}

/**
 * Extrae la hora formateada HH:mm de forma consistente
 */
function formatearHoraCorta(isoString: string): string {
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return ''
  }
}

/**
 * Calcula la duración legible entre dos timestamps
 */
function calcularDuracionTurno(inicio: string, fin: string): string {
  try {
    const tInicio = new Date(inicio).getTime()
    const tFin = new Date(fin).getTime()
    const diffMs = Math.max(0, tFin - tInicio)
    const horas = Math.floor(diffMs / (1000 * 60 * 60))
    const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    if (horas === 0) return `${minutos} min`
    return `${horas}h ${minutos}m`
  } catch {
    return 'N/D'
  }
}

/**
 * Genera el texto con formato profesional de WhatsApp para el cierre de caja
 */
export function formatearReporteCierreTexto(datos: DatosCierreCaja): string {
  const nombreKiosco = (datos.kioscoNombre || 'KIOSKO').trim().toUpperCase()
  const tipoTitulo = datos.esParcial ? 'ARQUEO PARCIAL DE CAJA (X)' : 'CIERRE DE CAJA (ARQUEO Z)'
  const duracion = calcularDuracionTurno(datos.fechaApertura, datos.fechaCierre)
  const horaInicio = formatearHoraCorta(datos.fechaApertura)
  const horaFin = formatearHoraCorta(datos.fechaCierre)
  const rangoHorario = horaInicio && horaFin ? `${horaInicio} a ${horaFin}` : 'Turno cerrado'

  const lineas: string[] = [
    `*${tipoTitulo}*`,
    `Comercio: *${nombreKiosco}*`,
    '----------------------------------------',
    `Cajero: ${datos.cajeroNombre || 'No asignado'}`,
    `Fecha: ${formatFecha(datos.fechaCierre)}`,
    `Turno: ${rangoHorario} (${duracion})`,
    '----------------------------------------',
    `*TOTAL FACTURADO: ${formatPrecio(datos.totalVentas)}*`,
    `Operaciones: ${datos.cantidadVentas ?? 0} ventas`,
    `Fondo Inicial: ${formatPrecio(datos.montoInicial)}`,
    '',
    '*DESGLOSE POR MEDIO DE PAGO:*',
  ]

  if (datos.ventasPorMedio && datos.ventasPorMedio.length > 0) {
    for (const m of datos.ventasPorMedio) {
      lineas.push(`- ${m.medio}: ${formatPrecio(m.total)}`)
    }
  } else {
    lineas.push('- Sin ventas registradas en el turno')
  }

  lineas.push('')
  lineas.push('*MOVIMIENTOS DE CAJA:*')
  lineas.push(`- Ingresos adicionales: ${formatPrecio(datos.ingresosExtra)}`)
  lineas.push(`- Egresos / Pagos: ${formatPrecio(datos.egresosExtra)}`)
  lineas.push('----------------------------------------')
  lineas.push('*CONTROL DE ARQUEO:*')
  lineas.push(`- Efectivo esperado: ${formatPrecio(datos.efectivoEsperado)}`)
  lineas.push(`- Efectivo contado:  ${formatPrecio(datos.efectivoContado)}`)

  const diff = datos.diferencia
  if (Math.abs(diff) < 0.01) {
    lineas.push('*DIFERENCIA: Caja Cuadrada ($0,00)*')
  } else if (diff > 0) {
    lineas.push(`*DIFERENCIA: Sobrante de +${formatPrecio(diff)}*`)
  } else {
    lineas.push(`*DIFERENCIA: Faltante de ${formatPrecio(diff)}*`)
  }

  lineas.push('----------------------------------------')
  lineas.push('KioskoApp - Control de Auditoría')

  return lineas.join('\n')
}

/**
 * Abre un enlace externo de forma 100% segura para PWAs y navegadores de escritorio.
 * Evita que Chromium PWA navegue la ventana principal de la app o quede en blanco.
 */
export function abrirEnlaceExternoSeguro(url: string) {
  if (typeof window === 'undefined' || !url) return
  try {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.style.position = 'fixed'
    a.style.top = '-9999px'
    a.style.left = '-9999px'
    a.style.opacity = '0'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      try {
        a.remove()
      } catch {
        // Ignorar
      }
    }, 400)
  } catch (err) {
    console.warn('Fallback a window.open:', err)
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/**
 * Genera el enlace directo a WhatsApp (usando api.whatsapp.com para máxima compatibilidad con PWAs)
 */
export function generarEnlaceWhatsApp(telefono: string, mensaje: string): string {
  const numeroLimpio = sanitizarNumeroWhatsApp(telefono)
  const encodedText = encodeURIComponent(mensaje)
  if (numeroLimpio) {
    return `https://api.whatsapp.com/send?phone=${numeroLimpio}&text=${encodedText}`
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`
}

/**
 * Envía el snapshot de cierre de caja vía HTTP POST al Webhook configurado
 */
export async function enviarWebhookCierreCaja(
  config: WhatsAppReportConfig,
  datos: DatosCierreCaja,
  mensajeTexto: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!config.webhookUrl || !config.webhookUrl.trim()) {
    return { ok: false, error: 'No hay URL de Webhook configurada' }
  }

  let url = config.webhookUrl.trim()
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url
  }
  const payload = {
    evento: datos.esParcial ? 'ARQUEO_PARCIAL' : 'CIERRE_CAJA',
    version: '2.0',
    timestamp: new Date().toISOString(),
    kiosco: {
      nombre: datos.kioscoNombre || 'Kiosco',
      direccion: datos.kioscoDireccion || null,
      telefono: datos.kioscoTelefono || null,
    },
    cajero: {
      nombre: datos.cajeroNombre || 'No especificado',
    },
    turno: {
      fechaApertura: datos.fechaApertura,
      fechaCierre: datos.fechaCierre,
      esParcial: Boolean(datos.esParcial),
      duracionMinutos: Math.round(
        Math.max(0, new Date(datos.fechaCierre).getTime() - new Date(datos.fechaApertura).getTime()) /
          (1000 * 60)
      ),
    },
    metricas: {
      montoInicial: datos.montoInicial,
      totalVentas: datos.totalVentas,
      cantidadVentas: datos.cantidadVentas ?? 0,
      ventasPorMedio: datos.ventasPorMedio || [],
      ingresosExtra: datos.ingresosExtra,
      egresosExtra: datos.egresosExtra,
      efectivoEsperado: datos.efectivoEsperado,
      efectivoContado: datos.efectivoContado,
      diferencia: datos.diferencia,
      estadoDiferencia:
        Math.abs(datos.diferencia) < 0.01
          ? 'CUADRADA'
          : datos.diferencia > 0
          ? 'SOBRANTE'
          : 'FALTANTE',
    },
    mensajeWhatsApp: mensajeTexto,
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (config.webhookToken && config.webhookToken.trim()) {
    headers['Authorization'] = `Bearer ${config.webhookToken.trim()}`
  }

  // Timeout seguro con AbortController para no trabar el flujo de la aplicación
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 7000)

  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (respuesta.ok) {
      return { ok: true, status: respuesta.status }
    } else {
      const errorText = await respuesta.text().catch(() => '')
      return {
        ok: false,
        status: respuesta.status,
        error: `Servidor respondió con status ${respuesta.status}: ${errorText.slice(0, 150)}`,
      }
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'Tiempo de espera agotado al conectar con el Webhook (7s timeout)' }
    }
    return { ok: false, error: err?.message || 'Error de conexión con el Webhook' }
  }
}

/**
 * Despacha de forma integrada el reporte de cierre (Webhook asíncrono + preparación de WhatsApp)
 */
export async function procesarDespachoCierre(
  kioscoId: string | null | undefined,
  datos: DatosCierreCaja
): Promise<{
  mensajeTexto: string
  whatsappUrl: string
  webhookIntentado: boolean
  webhookExito: boolean
  errorWebhook?: string
}> {
  const config = getWhatsAppReportConfig(kioscoId)
  const mensajeTexto = formatearReporteCierreTexto(datos)
  const whatsappUrl = generarEnlaceWhatsApp(config.whatsappDueno, mensajeTexto)

  let webhookIntentado = false
  let webhookExito = false
  let errorWebhook: string | undefined

  // Si está activada la apertura automática de WhatsApp, disparar inmediatamente con método seguro
  if (config.habilitado && config.autoAbrirWhatsApp && typeof window !== 'undefined') {
    try {
      abrirEnlaceExternoSeguro(whatsappUrl)
    } catch (err) {
      console.warn('No se pudo abrir automáticamente la pestaña de WhatsApp:', err)
    }
  }

  if (config.habilitado && config.webhookUrl && config.webhookUrl.trim()) {
    webhookIntentado = true
    try {
      const res = await enviarWebhookCierreCaja(config, datos, mensajeTexto)
      webhookExito = res.ok
      if (!res.ok) {
        errorWebhook = res.error
      }
    } catch (e: any) {
      webhookExito = false
      errorWebhook = e?.message || 'Error desconocido al enviar webhook'
    }
  }

  return {
    mensajeTexto,
    whatsappUrl,
    webhookIntentado,
    webhookExito,
    errorWebhook,
  }
}
