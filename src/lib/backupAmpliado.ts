import { STORAGE_KEY_ANCHO_TICKET } from './ticketPreferences'

export interface PreferenciasEquipoBackup {
  anchoPapel: '58mm' | '80mm'
  aperturaAutomatica: boolean
  impresionSilenciosa: boolean
  fiscalLocal: Record<string, unknown>
}

export interface BackupAmpliacion {
  configuracion_comercio: Record<string, unknown>
  saldos_snapshot: {
    clientes: Array<{ id: string; saldo_deudor: number }>
    proveedores: Array<{ id: string; saldo_pendiente: number }>
  }
  preferencias_equipo?: PreferenciasEquipoBackup
}

const APERTURA = 'kioskopos_abrir_cajon_efectivo_v1'
const TEXTOS_CONFIG = ['nombre', 'direccion', 'telefono', 'rubro', 'cuit', 'iibb', 'inicio_actividades', 'condicion_iva', 'afip_entorno']
const BOOLEANOS_CONFIG = ['afip_habilitado', 'arqueo_ciego_obligatorio']
const NUMEROS_CONFIG = ['afip_punto_venta', 'afip_alicuota_iva']
const EQUIPOS = ['impresoraTipo', 'impresoraModelo', 'impresoraConexion', 'lectorTipo', 'lectorModelo', 'lectorConexion', 'pointModelo', 'pointTerminalId', 'observaciones']
const CAPACIDADES = ['envases', 'balanza', 'vencimientos', 'serviciosRapidos']
const TEXTOS_FISCAL = ['razon_social', 'condicion_iva', 'cuit', 'iibb', 'inicio_actividades', 'entorno']
const BOOLEANOS_FISCAL = ['facturar_automatico', 'habilitado']
const NUMEROS_FISCAL = ['punto_venta', 'monto_minimo_auto']

function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Objeto de respaldo inválido')
  return valor as Record<string, unknown>
}

function claves(valor: Record<string, unknown>, permitidas: string[]): void {
  if (Object.keys(valor).some(key => !permitidas.includes(key))) throw new Error('Campo no permitido en respaldo')
}

function numero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && Math.abs(valor) <= 1e10
}

function escalares(valor: unknown, textos: string[], booleanos: string[], numeros: string[]): Record<string, unknown> {
  const datos = objeto(valor)
  claves(datos, [...textos, ...booleanos, ...numeros])
  for (const [key, value] of Object.entries(datos)) {
    if (value === null) continue
    if (textos.includes(key) ? typeof value !== 'string' || value.length > 10000
      : booleanos.includes(key) ? typeof value !== 'boolean' : !numero(value)) throw new Error('Tipo de configuración inválido')
  }
  return { ...datos }
}

function preferencias(valor: unknown): PreferenciasEquipoBackup {
  const datos = objeto(valor)
  claves(datos, ['anchoPapel', 'aperturaAutomatica', 'impresionSilenciosa', 'fiscalLocal'])
  if ((datos.anchoPapel !== '58mm' && datos.anchoPapel !== '80mm') || typeof datos.aperturaAutomatica !== 'boolean'
    || typeof datos.impresionSilenciosa !== 'boolean') throw new Error('Preferencias de equipo inválidas')
  return {
    anchoPapel: datos.anchoPapel, aperturaAutomatica: datos.aperturaAutomatica, impresionSilenciosa: datos.impresionSilenciosa,
    fiscalLocal: escalares(datos.fiscalLocal, TEXTOS_FISCAL, BOOLEANOS_FISCAL, NUMEROS_FISCAL),
  }
}

function saldos(valor: unknown, originales: unknown[], campo: string): Array<Record<string, string | number>> {
  if (!Array.isArray(valor) || valor.length !== originales.length) throw new Error('Snapshot de saldos incompleto')
  const porId = new Map<string, number>()
  for (const original of originales) {
    const fila = objeto(original)
    if (typeof fila.id !== 'string' || !fila.id || !numero(fila[campo]) || porId.has(fila.id)) throw new Error('Colección de saldos inválida')
    porId.set(fila.id, fila[campo])
  }
  return valor.map(item => {
    const fila = objeto(item)
    claves(fila, ['id', campo])
    if (typeof fila.id !== 'string' || !numero(fila[campo]) || !porId.has(fila.id) || porId.get(fila.id) !== fila[campo]) throw new Error('Saldo no coincide con la colección')
    porId.delete(fila.id)
    return { id: fila.id, [campo]: fila[campo] }
  })
}

export function validarAmpliacionBackup(valor: unknown, clientes: unknown[], proveedores: unknown[]): BackupAmpliacion {
  const datos = objeto(valor)
  claves(datos, ['configuracion_comercio', 'saldos_snapshot', 'preferencias_equipo'])
  const configuracion = objeto(datos.configuracion_comercio)
  if (typeof configuracion.nombre !== 'string' || !configuracion.nombre.trim()
    || typeof configuracion.rubro !== 'string'
    || !['KIOSCO', 'GENERAL', 'FOTOCOPIADORA_LIBRERIA', 'PETSHOP_VETERINARIA', 'ELECTRONICA_CELULARES'].includes(configuracion.rubro)) throw new Error('La configuración del respaldo está incompleta')
  const { capacidades_operativas, equipos_comercio, ...simples } = configuracion
  const segura = escalares(simples, TEXTOS_CONFIG, BOOLEANOS_CONFIG, NUMEROS_CONFIG)
  if (capacidades_operativas !== undefined) {
    if (capacidades_operativas !== null && Object.values(objeto(capacidades_operativas)).some(value => typeof value !== 'boolean')) throw new Error('Capacidades inválidas')
    segura.capacidades_operativas = capacidades_operativas === null ? null : escalares(capacidades_operativas, [], CAPACIDADES, [])
  }
  if (equipos_comercio !== undefined) {
    if (equipos_comercio !== null && Object.values(objeto(equipos_comercio)).some(value => typeof value !== 'string')) throw new Error('Equipos inválidos')
    segura.equipos_comercio = equipos_comercio === null ? null : escalares(equipos_comercio, EQUIPOS, [], [])
  }
  const snapshot = objeto(datos.saldos_snapshot)
  claves(snapshot, ['clientes', 'proveedores'])
  return {
    configuracion_comercio: segura,
    saldos_snapshot: {
      clientes: saldos(snapshot.clientes, clientes, 'saldo_deudor') as Array<{ id: string; saldo_deudor: number }>,
      proveedores: saldos(snapshot.proveedores, proveedores, 'saldo_pendiente') as Array<{ id: string; saldo_pendiente: number }>,
    },
    ...(datos.preferencias_equipo === undefined ? {} : { preferencias_equipo: preferencias(datos.preferencias_equipo) }),
  }
}

export function capturarPreferenciasEquipo(kioscoId: string): PreferenciasEquipoBackup {
  if (!kioscoId) throw new Error('Comercio requerido')
  const ancho = localStorage.getItem(STORAGE_KEY_ANCHO_TICKET)
  const apertura = localStorage.getItem(APERTURA)
  if (ancho !== null && ancho !== '58mm' && ancho !== '80mm') throw new Error('Ancho de ticket almacenado inválido')
  if (apertura !== null && apertura !== 'true' && apertura !== 'false') throw new Error('Preferencia de apertura inválida')
  const raw = localStorage.getItem(`kioskopos_afip_config_${kioscoId}`)
  const fiscal = raw === null ? {} : objeto(JSON.parse(raw))
  const proyectado = Object.fromEntries([...TEXTOS_FISCAL, ...BOOLEANOS_FISCAL, ...NUMEROS_FISCAL]
    .filter(key => Object.hasOwn(fiscal, key)).map(key => [key, fiscal[key]]))
  return preferencias({ anchoPapel: ancho ?? '58mm', aperturaAutomatica: apertura === 'true',
    // Política segura de restauración: no existe estado persistido que certifique impresión silenciosa.
    impresionSilenciosa: false, fiscalLocal: proyectado })
}

/** Sólo restaura el formato; requiere habilitar hardware y fiscalidad manualmente. */
export function restaurarPreferenciasEquipo(valor: PreferenciasEquipoBackup): void {
  const segura = preferencias(valor)
  // Desactivar primero evita conservar apertura automática si la escritura siguiente falla.
  localStorage.setItem(APERTURA, 'false')
  localStorage.setItem(STORAGE_KEY_ANCHO_TICKET, segura.anchoPapel)
  window.dispatchEvent(new CustomEvent('kioskopos_ancho_ticket_change', { detail: segura.anchoPapel }))
}
