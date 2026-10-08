/**
 * Módulo de Copia de Seguridad Integral (Full Backup) y Restauración para Kioscos
 * Permite descargar y restaurar en 1 solo clic un archivo JSON estructurado con la totalidad
 * de datos del comercio (productos, categorías, clientes, proveedores, promociones y lotes)
 * para resguardo ante contingencias, migración o recuperación de desastres.
 */

import { supabase } from './supabase'
import { descargarArchivo, sanitizarNombreArchivo } from './exportUtils'
import { clearCachedProductos } from './utils'
import { cifrarBackupJson } from './backupCrypto'
import { identidadRestaurada } from './backupIdentity'
import { leerColeccionPorId } from './backupPagination'
import { registrarDescargaRespaldoExterno } from './externalBackupReminder'
import { validarAmpliacionBackup, capturarPreferenciasEquipo, restaurarPreferenciasEquipo, type BackupAmpliacion } from './backupAmpliado'
import { auditoriaMotivoPrecioActiva, validarMotivoCambioPrecio } from './priceChangeAudit'
import { validarRelacionesBackup } from './backupRelations'
import { verificarProductosBackup, verificarLotesBackup, verificarPromocionesBackup, type ProductoEsperadoBackup, type PromocionEsperadaBackup } from './backupVerification'
import type { Categoria, Proveedor, Cliente, Producto } from '../types/database'

export interface BackupData {
  version: '2.0' | '3.0' | '4.0'
  app: 'KioskoApp'
  exportDate: string
  kiosco: {
    id: string
    nombre: string
  }
  estadisticas: {
    totalProductos: number
    totalCategorias: number
    totalClientes: number
    totalProveedores: number
    totalPromociones: number
    totalLotes: number
  }
  productos: any[]
  categorias: any[]
  clientes: any[]
  proveedores: any[]
  promociones: any[]
  lotes_producto: any[]
  configuracion_comercio?: BackupAmpliacion['configuracion_comercio']
  saldos_snapshot?: BackupAmpliacion['saldos_snapshot']
  preferencias_equipo?: BackupAmpliacion['preferencias_equipo']
  contenido: {
    colecciones: string[]
    incluyeVentas: false
    incluyeMovimientosCaja: false
    incluyeCredenciales: false
    incluyeConfiguracion?: boolean
    incluyeSaldos?: boolean
  }
}

export interface ResultadoValidacionBackup {
  valido: boolean
  mensaje?: string
  datos?: BackupData
  advertencias: string[]
  esMismoKiosco: boolean
}

export type ModoRestauracion = 'FUSION' | 'REEMPLAZO'

export interface ProgresoRestauracion {
  etapa: 'CATEGORIAS' | 'PROVEEDORES' | 'CLIENTES' | 'PRODUCTOS' | 'PROMOCIONES' | 'LOTES' | 'FINALIZANDO'
  etapaNombre: string
  porcentaje: number
  detalle: string
  itemsProcesados: number
  itemsTotales: number
}

export interface ResumenRestauracion {
  promocionesVerificadas?: number
  lotesVerificados?: number
  productosVerificados?: number
  categoriasCreadas: number
  categoriasReutilizadas: number
  proveedoresCreados: number
  proveedoresActualizados: number
  clientesCreados: number
  clientesActualizados: number
  productosCreados: number
  productosActualizados: number
  productosDesactivados: number
  promocionesRestauradas: number
  lotesRestaurados: number
  errores: string[]
}

export interface ResultadoRestauracion {
  ok: boolean
  mensaje: string
  resumen?: ResumenRestauracion
}

export interface OpcionesBackupIntegral {
  claveCifrado?: string
}

function idsConfirmados(datos: unknown): Set<string> {
  if (!Array.isArray(datos)) return new Set()
  return new Set(datos.flatMap((fila: unknown) => {
    if (typeof fila !== 'object' || fila === null || !('id' in fila) || typeof fila.id !== 'string') return []
    return [fila.id]
  }))
}

async function guardarRegistroRestaurado(
  tabla: 'promociones' | 'lotes_producto', origen: string, kioscoId: string,
  idOriginal: string, campos: Record<string, unknown>,
): Promise<string> {
  const id = await identidadRestaurada(origen, kioscoId, tabla, idOriginal)
  const { data: existente, error: errorLectura } = await supabase.from(tabla)
    .select('id').eq('kiosco_id', kioscoId).eq('id', id).maybeSingle()
  if (errorLectura) throw new Error(errorLectura.message)
  // Evita que un conflicto de ID reasigne un registro de otro comercio mediante upsert.
  const consulta = existente
    ? supabase.from(tabla).update(campos).eq('kiosco_id', kioscoId).eq('id', id)
    : supabase.from(tabla).insert({ ...campos, id, kiosco_id: kioscoId })
  const { data: confirmado, error } = await consulta.select('id').single()
  if (error) throw new Error(error.message)
  if (confirmado?.id !== id) throw new Error('El servidor no confirmó el registro restaurado.')
  return id
}

/**
 * Genera y descarga un snapshot completo del kiosco en formato JSON
 */
export async function generarBackupIntegral(
  kioscoId: string,
  kioscoNombre?: string,
  opciones: OpcionesBackupIntegral = {}
): Promise<{ ok: boolean; mensaje: string }> {
  if (!kioscoId) {
    return { ok: false, mensaje: 'ID de comercio no especificado.' }
  }

  try {
    const { data, error } = await supabase.rpc('generar_snapshot_backup_ampliado', { p_kiosco_id: kioscoId })
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') {
        throw new Error('El servicio de respaldo todavía no está habilitado. Contactá al administrador.')
      }
      throw new Error(error.message || 'No se pudo obtener el respaldo del servidor.')
    }

    const validacion = validarBackupJSON(JSON.stringify(data ?? null), kioscoId)
    if (!validacion.valido || !validacion.datos || validacion.datos.version !== '4.0') {
      throw new Error(validacion.mensaje || 'El servidor devolvió un respaldo incompleto o incompatible.')
    }
    if (!validacion.esMismoKiosco) {
      throw new Error('El respaldo recibido no corresponde a este comercio.')
    }
    const recibido = data as BackupData
    const backupPayload = validacion.datos
    const conteos = Object.entries(backupPayload.estadisticas) as [keyof BackupData['estadisticas'], number][]
    if (conteos.some(([campo, cantidad]) => recibido.estadisticas?.[campo] !== cantidad)) {
      throw new Error('Los conteos del respaldo no coinciden con los registros recibidos. No se descargó una copia parcial.')
    }
    if (
      recibido.contenido?.incluyeCredenciales !== false ||
      recibido.contenido.incluyeVentas !== false ||
      recibido.contenido.incluyeMovimientosCaja !== false ||
      recibido.contenido.incluyeConfiguracion !== true || recibido.contenido.incluyeSaldos !== true
    ) {
      throw new Error('El alcance del respaldo recibido no corresponde al formato esperado.')
    }

    backupPayload.preferencias_equipo = capturarPreferenciasEquipo(kioscoId)
    const jsonStr = JSON.stringify(backupPayload, null, 2)
    const contenidoDescarga = opciones.claveCifrado
      ? await cifrarBackupJson(jsonStr, opciones.claveCifrado)
      : jsonStr
    const fechaHora = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const nombreSanitizado = sanitizarNombreArchivo(kioscoNombre || 'kiosco')
    const fileName = opciones.claveCifrado
      ? `backup_integral_cifrado_${nombreSanitizado}_${fechaHora}.json`
      : `backup_integral_${nombreSanitizado}_${fechaHora}.json`

    descargarArchivo(contenidoDescarga, fileName, 'application/json;charset=utf-8;')
    registrarDescargaRespaldoExterno(kioscoId, 'JSON')

    return {
      ok: true,
      mensaje: `Copia de seguridad integral${opciones.claveCifrado ? ' cifrada' : ''} descargada con éxito (${backupPayload.productos.length} productos, ${backupPayload.clientes.length} clientes, ${backupPayload.promociones.length} promociones).`,
    }
  } catch (error: any) {
    return {
      ok: false,
      mensaje: error?.message ? `Error al generar backup: ${error.message}` : 'Error desconocido al generar backup',
    }
  }
}

/**
 * Valida la estructura, versión y coherencia de un archivo JSON de backup
 */
export function validarBackupJSON(contenidoTexto: string, kioscoActualId?: string): ResultadoValidacionBackup {
  const advertencias: string[] = []

  if (!contenidoTexto || !contenidoTexto.trim()) {
    return { valido: false, mensaje: 'El archivo está completamente vacío.', advertencias, esMismoKiosco: false }
  }

  let parsed: any
  try {
    parsed = JSON.parse(contenidoTexto)
  } catch {
    return { valido: false, mensaje: 'El archivo no contiene un formato JSON válido.', advertencias, esMismoKiosco: false }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { valido: false, mensaje: 'La estructura raíz del archivo no es un objeto válido.', advertencias, esMismoKiosco: false }
  }

  // Validación de firma de aplicación
  if (parsed.app !== 'KioskoApp') {
    return {
      valido: false,
      mensaje: 'El archivo no fue creado por KioskoApp o no contiene la firma de backup esperada.',
      advertencias,
      esMismoKiosco: false,
    }
  }

  const version = parsed.version || '2.0'
  if (version !== '2.0' && version !== '3.0' && version !== '4.0') {
    return { valido: false, mensaje: `La versión de backup ${String(version)} no es compatible.`, advertencias, esMismoKiosco: false }
  }

  if (version === '3.0' || version === '4.0') {
    const coleccionesRequeridas = ['productos', 'categorias', 'clientes', 'proveedores', 'promociones', 'lotes_producto']
    const incompletas = coleccionesRequeridas.filter((coleccion) => !Array.isArray(parsed[coleccion]))
    if (incompletas.length > 0 || !parsed.kiosco?.id || !parsed.exportDate) {
      return {
        valido: false,
        mensaje: `La copia 3.0 está incompleta${incompletas.length ? `: faltan ${incompletas.join(', ')}` : '.'}`,
        advertencias,
        esMismoKiosco: false,
      }
    }
  }

  let ampliacion: BackupAmpliacion | undefined
  if (version === '3.0' || version === '4.0') {
    try { validarRelacionesBackup(parsed) }
    catch (error: unknown) {
      return { valido: false, mensaje: error instanceof Error ? error.message : 'Relaciones del respaldo inválidas', advertencias, esMismoKiosco: false }
    }
  }
  if (version === '4.0') {
    try { ampliacion = validarAmpliacionBackup({ configuracion_comercio: parsed.configuracion_comercio, saldos_snapshot: parsed.saldos_snapshot, preferencias_equipo: parsed.preferencias_equipo }, parsed.clientes, parsed.proveedores) }
    catch (error: unknown) {
      return { valido: false, mensaje: error instanceof Error ? error.message : 'El respaldo ampliado está incompleto', advertencias, esMismoKiosco: false }
    }
    advertencias.push('Los saldos son una foto de la fecha del respaldo. Los saldos de clientes y proveedores existentes se conservan al restaurar.')
  }

  // Comprobar colecciones esenciales
  if (!Array.isArray(parsed.productos)) {
    return {
      valido: false,
      mensaje: 'El archivo no contiene el catálogo de productos necesario para restaurar.',
      advertencias,
      esMismoKiosco: false,
    }
  }

  // Validar si pertenece a este comercio o a otro
  const esMismoKiosco = Boolean(kioscoActualId && parsed.kiosco?.id === kioscoActualId)
  if (kioscoActualId && parsed.kiosco?.id && parsed.kiosco.id !== kioscoActualId) {
    advertencias.push(
      `El backup proviene de otro comercio ("${parsed.kiosco.nombre || 'Comercio Externo'}"). Los datos se reasignarán a tu negocio actual.`
    )
  }

  // Validar antigüedad de la copia
  if (parsed.exportDate) {
    const fecha = new Date(parsed.exportDate)
    if (!isNaN(fecha.getTime())) {
      const dias = (Date.now() - fecha.getTime()) / (1000 * 60 * 60 * 24)
      if (dias > 30) {
        advertencias.push(
          `Esta copia fue generada hace más de ${Math.floor(dias)} días (${fecha.toLocaleDateString('es-AR')}).`
        )
      }
    }
  }

  const datosValidados: BackupData = {
    version,
    app: 'KioskoApp',
    exportDate: parsed.exportDate || new Date().toISOString(),
    kiosco: {
      id: parsed.kiosco?.id || '',
      nombre: parsed.kiosco?.nombre || 'Comercio',
    },
    estadisticas: {
      totalProductos: Array.isArray(parsed.productos) ? parsed.productos.length : 0,
      totalCategorias: Array.isArray(parsed.categorias) ? parsed.categorias.length : 0,
      totalClientes: Array.isArray(parsed.clientes) ? parsed.clientes.length : 0,
      totalProveedores: Array.isArray(parsed.proveedores) ? parsed.proveedores.length : 0,
      totalPromociones: Array.isArray(parsed.promociones) ? parsed.promociones.length : 0,
      totalLotes: Array.isArray(parsed.lotes_producto) ? parsed.lotes_producto.length : 0,
    },
    productos: parsed.productos || [],
    categorias: Array.isArray(parsed.categorias) ? parsed.categorias : [],
    clientes: Array.isArray(parsed.clientes) ? parsed.clientes : [],
    proveedores: Array.isArray(parsed.proveedores) ? parsed.proveedores : [],
    promociones: Array.isArray(parsed.promociones) ? parsed.promociones : [],
    lotes_producto: Array.isArray(parsed.lotes_producto) ? parsed.lotes_producto : [],
    ...ampliacion,
    contenido: {
      colecciones: Array.isArray(parsed.contenido?.colecciones)
        ? parsed.contenido.colecciones.filter((item: unknown): item is string => typeof item === 'string')
        : ['productos', 'categorias', 'clientes', 'proveedores', 'promociones', 'lotes_producto'],
      incluyeVentas: false,
      incluyeMovimientosCaja: false,
      incluyeCredenciales: false,
      ...(version === '4.0' ? { incluyeConfiguracion: true, incluyeSaldos: true } : {}),
    },
  }

  return {
    valido: true,
    datos: datosValidados,
    advertencias,
    esMismoKiosco,
  }
}

/**
 * Ejecuta la restauración integral del backup en Supabase
 */
export async function restaurarBackupIntegral(
  backupData: BackupData,
  modo: ModoRestauracion,
  kioscoId: string,
  onProgreso?: (progreso: ProgresoRestauracion) => void,
  opciones: { restaurarConfiguracion?: boolean; restaurarPreferencias?: boolean; motivoCambioPrecio?: string } = {},
): Promise<ResultadoRestauracion> {
  if (!kioscoId) {
    return { ok: false, mensaje: 'ID de comercio no especificado para la restauración.' }
  }

  let motivoPrecio: string | undefined
  if (auditoriaMotivoPrecioActiva()) {
    try { motivoPrecio = validarMotivoCambioPrecio(opciones.motivoCambioPrecio) }
    catch (error) { return { ok: false, mensaje: error instanceof Error ? error.message : 'Motivo inválido.' } }
  }

  const resumen: ResumenRestauracion = {
    categoriasCreadas: 0,
    categoriasReutilizadas: 0,
    proveedoresCreados: 0,
    proveedoresActualizados: 0,
    clientesCreados: 0,
    clientesActualizados: 0,
    productosCreados: 0,
    productosActualizados: 0,
    productosDesactivados: 0,
    promocionesRestauradas: 0,
    lotesRestaurados: 0,
    errores: [],
  }

  const reportar = (
    etapa: ProgresoRestauracion['etapa'],
    etapaNombre: string,
    porcentaje: number,
    detalle: string,
    procesados = 0,
    totales = 0
  ) => {
    if (onProgreso) {
      onProgreso({
        etapa,
        etapaNombre,
        porcentaje: Math.min(100, Math.max(0, Math.round(porcentaje))),
        detalle,
        itemsProcesados: procesados,
        itemsTotales: totales,
      })
    }
  }

  try {
    if (backupData.version === '2.0' && backupData.productos.some(prod => prod.es_combo === true)) {
      throw new Error('La copia 2.0 no permite recuperar componentes de combos. Generá una copia nueva.')
    }
    if (backupData.version === '3.0' || backupData.version === '4.0') validarRelacionesBackup(backupData)
    if (backupData.version === '4.0') validarAmpliacionBackup({ configuracion_comercio: backupData.configuracion_comercio, saldos_snapshot: backupData.saldos_snapshot, preferencias_equipo: backupData.preferencias_equipo }, backupData.clientes, backupData.proveedores)
    if ((opciones.restaurarConfiguracion || opciones.restaurarPreferencias)
      && (backupData.version !== '4.0' || backupData.kiosco.id !== kioscoId)) throw new Error('La configuración sólo se recupera desde una copia 4.0 del mismo comercio')
    // ─────────────────────────────────────────────────────────────
    // PASO 1: CATEGORÍAS (Mapeo Nombre/ID -> ID Actual)
    // ─────────────────────────────────────────────────────────────
    reportar('CATEGORIAS', 'Sincronizando Categorías', 5, 'Consultando categorías existentes...')

    const categoriasExistentes = await leerColeccionPorId<Pick<Categoria, 'id' | 'nombre' | 'orden'>>((ultimoId) => {
      const consulta = supabase.from('categorias').select('id, nombre, orden')
        .eq('kiosco_id', kioscoId).order('id').limit(500)
      return ultimoId ? consulta.gt('id', ultimoId) : consulta
    }, 'categorías')

    const mapaCategoriasPorNombre = new Map<string, string>()
    const mapaCategoriasPorIdOriginal = new Map<string, string>()

    categoriasExistentes?.forEach((c) => {
      mapaCategoriasPorNombre.set(c.nombre.trim().toLowerCase(), c.id)
    })

    const categoriasBackup = backupData.categorias || []
    let maxOrden = categoriasExistentes?.reduce((max, c) => Math.max(max, c.orden || 0), 0) || 0

    for (let i = 0; i < categoriasBackup.length; i++) {
      const cat = categoriasBackup[i]
      const nombreNorm = (cat.nombre || '').trim().toLowerCase()
      if (!nombreNorm) {
        resumen.errores.push(`Categoría ${i + 1}: falta el nombre.`)
        continue
      }

      const idExistente = mapaCategoriasPorNombre.get(nombreNorm)
      if (idExistente) {
        mapaCategoriasPorIdOriginal.set(cat.id, idExistente)
        resumen.categoriasReutilizadas++
      } else {
        maxOrden++
        const { data: nuevaCat, error: errInsertCat } = await supabase
          .from('categorias')
          .insert({
            kiosco_id: kioscoId,
            nombre: cat.nombre.trim(),
            color: cat.color || '#4f46e5',
            orden: cat.orden ?? maxOrden,
            activo: true,
          })
          .select('id')
          .single()

        if (!errInsertCat && nuevaCat) {
          mapaCategoriasPorNombre.set(nombreNorm, nuevaCat.id)
          mapaCategoriasPorIdOriginal.set(cat.id, nuevaCat.id)
          resumen.categoriasCreadas++
        } else {
          resumen.errores.push(`Categoría "${cat.nombre}": ${errInsertCat?.message || 'El servidor no confirmó el registro creado.'}`)
        }
      }

      reportar(
        'CATEGORIAS',
        'Sincronizando Categorías',
        5 + (i / Math.max(1, categoriasBackup.length)) * 10,
        `Procesando categoría ${i + 1} de ${categoriasBackup.length}`,
        i + 1,
        categoriasBackup.length
      )
    }

    // ─────────────────────────────────────────────────────────────
    // PASO 2: PROVEEDORES (Mapeo Nombre/CUIT -> ID Actual)
    // ─────────────────────────────────────────────────────────────
    reportar('PROVEEDORES', 'Sincronizando Proveedores', 15, 'Consultando proveedores existentes...')

    const proveedoresExistentes = await leerColeccionPorId<Pick<Proveedor, 'id' | 'nombre' | 'cuit'>>((ultimoId) => {
      const consulta = supabase.from('proveedores').select('id, nombre, cuit')
        .eq('kiosco_id', kioscoId).order('id').limit(500)
      return ultimoId ? consulta.gt('id', ultimoId) : consulta
    }, 'proveedores')

    const mapaProveedoresPorNombre = new Map<string, string>()
    const mapaProveedoresPorIdOriginal = new Map<string, string>()

    proveedoresExistentes?.forEach((p) => {
      mapaProveedoresPorNombre.set(p.nombre.trim().toLowerCase(), p.id)
      if (p.cuit) mapaProveedoresPorNombre.set(p.cuit.trim(), p.id)
    })

    const proveedoresBackup = backupData.proveedores || []
    for (let i = 0; i < proveedoresBackup.length; i++) {
      const prov = proveedoresBackup[i]
      const nombreNorm = (prov.nombre || '').trim().toLowerCase()
      if (!nombreNorm) {
        resumen.errores.push(`Proveedor ${i + 1}: falta el nombre.`)
        continue
      }

      const idExistente =
        mapaProveedoresPorNombre.get(nombreNorm) || (prov.cuit ? mapaProveedoresPorNombre.get(prov.cuit.trim()) : null)

      if (idExistente) {
        mapaProveedoresPorIdOriginal.set(prov.id, idExistente)
        // Actualizar datos de contacto si están presentes
        const { data: proveedoresConfirmados, error: errorActualizarProveedor } = await supabase
          .from('proveedores')
          .update({
            contacto_nombre: prov.contacto_nombre ?? null,
            telefono: prov.telefono ?? null,
            email: prov.email ?? null,
            cuit: prov.cuit ?? null,
            dias_visita: prov.dias_visita ?? null,
            cbu_alias: prov.cbu_alias ?? null,
          })
          .eq('id', idExistente)
          .eq('kiosco_id', kioscoId)
          .select('id')
        if (errorActualizarProveedor) {
          resumen.errores.push(`Proveedor "${prov.nombre}": ${errorActualizarProveedor.message}`)
        } else if (!idsConfirmados(proveedoresConfirmados).has(idExistente)) {
          resumen.errores.push(`Proveedor "${prov.nombre}": el servidor no confirmó la actualización.`)
        } else {
          resumen.proveedoresActualizados++
        }
      } else {
        const { data: nuevoProv, error: errInsertProv } = await supabase
          .from('proveedores')
          .insert({
            kiosco_id: kioscoId,
            nombre: prov.nombre.trim(),
            contacto_nombre: prov.contacto_nombre || null,
            telefono: prov.telefono || null,
            email: prov.email || null,
            cuit: prov.cuit || null,
            dias_visita: prov.dias_visita || null,
            cbu_alias: prov.cbu_alias || null,
            saldo_pendiente: Number(prov.saldo_pendiente) || 0,
            activo: true,
          })
          .select('id')
          .single()

        if (!errInsertProv && nuevoProv) {
          mapaProveedoresPorNombre.set(nombreNorm, nuevoProv.id)
          mapaProveedoresPorIdOriginal.set(prov.id, nuevoProv.id)
          resumen.proveedoresCreados++
        } else {
          resumen.errores.push(`Proveedor "${prov.nombre}": ${errInsertProv?.message || 'El servidor no confirmó el registro creado.'}`)
        }
      }

      reportar(
        'PROVEEDORES',
        'Sincronizando Proveedores',
        15 + (i / Math.max(1, proveedoresBackup.length)) * 10,
        `Procesando proveedor ${i + 1} de ${proveedoresBackup.length}`,
        i + 1,
        proveedoresBackup.length
      )
    }

    // ─────────────────────────────────────────────────────────────
    // PASO 3: CLIENTES Y CUENTAS CORRIENTES
    // ─────────────────────────────────────────────────────────────
    reportar('CLIENTES', 'Sincronizando Clientes', 25, 'Consultando clientes actuales...')

    const clientesExistentes = await leerColeccionPorId<Pick<Cliente, 'id' | 'nombre' | 'dni_cuit'>>((ultimoId) => {
      const consulta = supabase.from('clientes').select('id, nombre, dni_cuit')
        .eq('kiosco_id', kioscoId).order('id').limit(500)
      return ultimoId ? consulta.gt('id', ultimoId) : consulta
    }, 'clientes')

    const mapaClientesPorNombre = new Map<string, string>()
    clientesExistentes?.forEach((c) => {
      mapaClientesPorNombre.set(c.nombre.trim().toLowerCase(), c.id)
      if (c.dni_cuit && c.dni_cuit.trim().length > 0) {
        mapaClientesPorNombre.set(c.dni_cuit.trim(), c.id)
      }
    })

    const clientesBackup = backupData.clientes || []
    for (let i = 0; i < clientesBackup.length; i++) {
      const cli = clientesBackup[i]
      const nombreNorm = (cli.nombre || '').trim().toLowerCase()
      if (!nombreNorm) {
        resumen.errores.push(`Cliente ${i + 1}: falta el nombre.`)
        continue
      }

      const idExistente =
        mapaClientesPorNombre.get(nombreNorm) ||
        (cli.dni_cuit && cli.dni_cuit.trim().length > 0 ? mapaClientesPorNombre.get(cli.dni_cuit.trim()) : null)

      if (idExistente) {
        const { data: clientesConfirmados, error: errorActualizarCliente } = await supabase
          .from('clientes')
          .update({
            telefono: cli.telefono || null,
            dni_cuit: cli.dni_cuit || null,
            direccion: cli.direccion || null,
            limite_credito: cli.limite_credito !== undefined ? cli.limite_credito : null,
            notas: cli.notas || null,
          })
          .eq('id', idExistente)
          .eq('kiosco_id', kioscoId)
          .select('id')
        if (errorActualizarCliente) {
          resumen.errores.push(`Cliente "${cli.nombre}": ${errorActualizarCliente.message}`)
        } else if (!idsConfirmados(clientesConfirmados).has(idExistente)) {
          resumen.errores.push(`Cliente "${cli.nombre}": el servidor no confirmó la actualización.`)
        } else {
          resumen.clientesActualizados++
        }
      } else {
        const { data: cliNuevo, error: errInsertCli } = await supabase
          .from('clientes')
          .insert({
            kiosco_id: kioscoId,
            nombre: cli.nombre.trim(),
            telefono: cli.telefono || null,
            dni_cuit: cli.dni_cuit || null,
            direccion: cli.direccion || null,
            limite_credito: cli.limite_credito !== undefined ? cli.limite_credito : null,
            saldo_deudor: Number(cli.saldo_deudor) || 0,
            puntos_fidelidad: Number(cli.puntos_fidelidad) || 0,
            notas: cli.notas || null,
            activo: true,
          })
          .select('id')
          .single()

        if (!errInsertCli && cliNuevo) {
          mapaClientesPorNombre.set(nombreNorm, cliNuevo.id)
          if (cli.dni_cuit && cli.dni_cuit.trim().length > 0) {
            mapaClientesPorNombre.set(cli.dni_cuit.trim(), cliNuevo.id)
          }
          resumen.clientesCreados++
        } else {
          resumen.errores.push(`Cliente "${cli.nombre}": ${errInsertCli?.message || 'El servidor no confirmó el registro creado.'}`)
        }
      }

      reportar(
        'CLIENTES',
        'Sincronizando Clientes',
        25 + (i / Math.max(1, clientesBackup.length)) * 10,
        `Procesando cliente ${i + 1} de ${clientesBackup.length}`,
        i + 1,
        clientesBackup.length
      )
    }

    // ─────────────────────────────────────────────────────────────
    // PASO 4: PRODUCTOS (En Chunks de 50 registros)
    // ─────────────────────────────────────────────────────────────
    reportar('PRODUCTOS', 'Restaurando Catálogo de Productos', 35, 'Cargando catálogo existente...')

    const prodsExistentes = await leerColeccionPorId<Pick<Producto, 'id' | 'codigo_barras' | 'descripcion' | 'activo' | 'es_combo'>>((ultimoId) => {
      const consulta = supabase.from('productos').select('id, codigo_barras, descripcion, activo, es_combo')
        .eq('kiosco_id', kioscoId).order('id').limit(500)
      return ultimoId ? consulta.gt('id', ultimoId) : consulta
    }, 'productos')

    const mapaProdsPorCodigo = new Map<string, any>()
    const mapaProdsPorDesc = new Map<string, any>()
    const mapaProductosIdOriginal = new Map<string, string>()
    const productosEsperados = new Map<string, ProductoEsperadoBackup['campos']>()
    const idsExistentes = new Set<string>()
    const combosExistentes = new Set<string>()

    prodsExistentes?.forEach((p) => {
      idsExistentes.add(p.id)
      if (p.es_combo === true) combosExistentes.add(p.id)
      if (p.codigo_barras) mapaProdsPorCodigo.set(p.codigo_barras.trim().toLowerCase(), p)
      mapaProdsPorDesc.set(p.descripcion.trim().toLowerCase(), p)
    })

    const productosBackup = backupData.productos || []
    const idsProcesadosEnBackup = new Set<string>()
    const CHUNK_SIZE = 50

    for (let i = 0; i < productosBackup.length; i += CHUNK_SIZE) {
      const chunk = productosBackup.slice(i, i + CHUNK_SIZE)

      await Promise.all(
        chunk.map(async (prod) => {
          try {
            const descNorm = (prod.descripcion || '').trim().toLowerCase()
            const codeNorm = (prod.codigo_barras || '').trim().toLowerCase()

            // Resolver categoría mapeada
            let categoriaIdFinal: string | null = null
            if (prod.categoria_id) {
              categoriaIdFinal = mapaCategoriasPorIdOriginal.get(prod.categoria_id) || null
            }
            if (!categoriaIdFinal && prod.categoria?.nombre) {
              categoriaIdFinal = mapaCategoriasPorNombre.get(prod.categoria.nombre.trim().toLowerCase()) || null
            }

            // Resolver proveedor mapeado
            let proveedorIdFinal: string | null = null
            if (prod.proveedor_id) {
              proveedorIdFinal = mapaProveedoresPorIdOriginal.get(prod.proveedor_id) || null
            }
            if (prod.categoria_id && !categoriaIdFinal) throw new Error('No se pudo recuperar la categoría del producto.')
            if (prod.proveedor_id && !proveedorIdFinal) throw new Error('No se pudo recuperar el proveedor del producto.')

            // Buscar si ya existe por código o descripción
            const prodExistente =
              (codeNorm ? mapaProdsPorCodigo.get(codeNorm) : null) || (descNorm ? mapaProdsPorDesc.get(descNorm) : null)

            const datosProducto = {
              kiosco_id: kioscoId,
              descripcion: prod.descripcion.trim(),
              precio_costo: Number(prod.precio_costo) || 0,
              precio_venta: Number(prod.precio_venta) || 0,
              stock_actual: Number(prod.stock_actual) || 0,
              stock_minimo: prod.stock_minimo != null && Number.isFinite(Number(prod.stock_minimo)) ? Number(prod.stock_minimo) : 5,
              categoria_id: categoriaIdFinal,
              proveedor_id: proveedorIdFinal,
              codigo_barras: prod.codigo_barras ? prod.codigo_barras.trim() : null,
              activo: prod.activo !== false,
              es_pesable: Boolean(prod.es_pesable),
              unidad_medida: prod.unidad_medida || 'UN',
              plu_balanza: prod.plu_balanza || null,
              es_retornable: Boolean(prod.es_retornable),
              precio_envase: Number(prod.precio_envase) || 0,
              nombre_envase: prod.nombre_envase || null,
              requiere_vencimiento: Boolean(prod.requiere_vencimiento),
              dias_alerta_vencimiento: Number(prod.dias_alerta_vencimiento) || 15,
            }

            if (prodExistente) {
              const { data: productosConfirmados, error: errUpd } = await supabase
                .from('productos')
                .update({
                  ...datosProducto,
                  ...(motivoPrecio ? { motivo_cambio_precio: motivoPrecio } : {}),
                  fecha_actualizacion: new Date().toISOString(),
                })
                .eq('id', prodExistente.id)
                .eq('kiosco_id', kioscoId)
                .select('id')

              if (!errUpd && idsConfirmados(productosConfirmados).has(prodExistente.id)) {
                idsProcesadosEnBackup.add(prodExistente.id)
                if (prod.id) mapaProductosIdOriginal.set(prod.id, prodExistente.id)
                resumen.productosActualizados++
                productosEsperados.set(prodExistente.id, { ...datosProducto, ...(typeof prod.es_combo === 'boolean' ? { es_combo: prod.es_combo } : {}) })
              } else {
                resumen.errores.push(`Producto "${prod.descripcion}": ${errUpd?.message || 'El servidor no confirmó la actualización.'}`)
              }
            } else {
              const { data: prodNuevo, error: errIns } = await supabase
                .from('productos')
                .insert({
                  ...datosProducto,
                  fecha_creacion: new Date().toISOString(),
                  fecha_actualizacion: new Date().toISOString(),
                })
                .select('id, codigo_barras, descripcion')
                .single()

              if (!errIns && prodNuevo) {
                idsProcesadosEnBackup.add(prodNuevo.id)
                if (prod.id) {
                  mapaProductosIdOriginal.set(prod.id, prodNuevo.id)
                }
                if (codeNorm) mapaProdsPorCodigo.set(codeNorm, prodNuevo)
                if (descNorm) mapaProdsPorDesc.set(descNorm, prodNuevo)
                resumen.productosCreados++
                productosEsperados.set(prodNuevo.id, { ...datosProducto, ...(typeof prod.es_combo === 'boolean' ? { es_combo: prod.es_combo } : {}) })
              } else {
                resumen.errores.push(`Producto "${prod.descripcion}": ${errIns?.message || 'El servidor no confirmó el registro creado.'}`)
              }
            }
          } catch (e: any) {
            resumen.errores.push(`Error en producto "${prod.descripcion || 'S/N'}": ${e.message}`)
          }
        })
      )

      const procesadosHastaAca = Math.min(productosBackup.length, i + CHUNK_SIZE)
      reportar(
        'PRODUCTOS',
        'Restaurando Catálogo de Productos',
        35 + (procesadosHastaAca / Math.max(1, productosBackup.length)) * 40,
        `Restaurando productos (${procesadosHastaAca} de ${productosBackup.length})...`,
        procesadosHastaAca,
        productosBackup.length
      )
    }

    // ─────────────────────────────────────────────────────────────
    // PASO 5: PROMOCIONES Y COMBOS
    // ─────────────────────────────────────────────────────────────
    reportar('PROMOCIONES', 'Restaurando Promociones y Combos', 80, 'Restaurando promociones comerciales...')
    // Los componentes se recuperan después de confirmar todos los productos.
    // Primero se convierten los físicos para permitir reutilizar un antiguo combo como componente.
    const productosConComponentes = productosBackup.filter(prod => Array.isArray(prod.componentes_combo)
      && (prod.es_combo === true || combosExistentes.has(mapaProductosIdOriginal.get(prod.id) || '')))
      .sort((a, b) => Number(a.es_combo === true) - Number(b.es_combo === true))
    for (const prod of productosConComponentes) {
      try {
        const idDestino = mapaProductosIdOriginal.get(prod.id)
        if (!idDestino) throw new Error('No se confirmó el producto del combo.')
        const componentes = (prod.componentes_combo as Array<{ componente_producto_id: string; cantidad: number }>).map(item => {
          const id = mapaProductosIdOriginal.get(item.componente_producto_id)
          if (!id) throw new Error('No se confirmó un componente del combo.')
          return { componente_producto_id: id, cantidad: item.cantidad }
        })
        const { data, error } = await supabase.rpc('restaurar_combo_backup', {
          p_kiosco_id: kioscoId, p_producto_id: idDestino, p_es_combo: prod.es_combo === true, p_componentes: componentes,
        })
        if (error) throw new Error(error.message)
        if (data?.producto_id !== idDestino || data.es_combo !== (prod.es_combo === true)
          || data.componentes !== componentes.length) throw new Error('El servidor no confirmó los componentes del combo.')
        const esperado = productosEsperados.get(idDestino)
        if (esperado) productosEsperados.set(idDestino,{ ...esperado, es_combo: prod.es_combo === true })
      } catch (error: unknown) {
        resumen.errores.push(`Combo "${prod.descripcion || 'S/N'}": ${error instanceof Error ? error.message : 'No se pudo recuperar.'}`)
      }
    }
    const promocionesBackup = backupData.promociones || []
    const promocionesEsperadas: PromocionEsperadaBackup[] = []

    for (let i = 0; i < promocionesBackup.length; i++) {
      const promo = promocionesBackup[i]
      if (!promo.nombre) {
        resumen.errores.push(`Promoción ${i + 1}: falta el nombre.`)
        continue
      }

      try {
        const productoId = promo.producto_id ? mapaProductosIdOriginal.get(promo.producto_id) : null
        const categoriaId = promo.categoria_id ? mapaCategoriasPorIdOriginal.get(promo.categoria_id) : null
        if (promo.producto_id && !productoId) throw new Error('No se recuperó el producto de la promoción.')
        if (promo.categoria_id && !categoriaId) throw new Error('No se recuperó la categoría de la promoción.')
        const itemsCombo = Array.isArray(promo.items_combo) ? promo.items_combo.map((item: { producto_id: string; cantidad: number }) => {
          const producto = mapaProductosIdOriginal.get(item.producto_id)
          if (!producto) throw new Error('No se recuperó un componente del combo.')
          return { producto_id: producto, cantidad: item.cantidad }
        }) : null
        const campos = {
          nombre: promo.nombre.trim(),
          tipo: promo.tipo,
          producto_id: productoId || null,
          categoria_id: categoriaId || null,
          cantidad_minima: promo.cantidad_minima ?? 1,
          cantidad_paga: promo.cantidad_paga ?? null,
          precio_unitario_promo: promo.precio_unitario_promo ?? null,
          descuento_porcentaje: promo.descuento_porcentaje ?? null,
          precio_combo: promo.precio_combo ?? null,
          items_combo: itemsCombo,
          dias_semana: Array.isArray(promo.dias_semana) ? promo.dias_semana : null,
          activo: promo.activo !== false,
          fecha_inicio: promo.fecha_inicio || null,
          fecha_fin: promo.fecha_fin || null,
        }
        const id = await guardarRegistroRestaurado('promociones', backupData.kiosco.id, kioscoId, promo.id, campos)
        promocionesEsperadas.push({ id, campos })
        resumen.promocionesRestauradas++
      } catch (error: unknown) {
        resumen.errores.push(`Promoción "${promo.nombre}": ${error instanceof Error ? error.message : 'Error inesperado.'}`)
      }
    }

    // ─────────────────────────────────────────────────────────────
    // PASO 6: LOTES DE VENCIMIENTO (FEFO)
    // ─────────────────────────────────────────────────────────────
    reportar('LOTES', 'Restaurando Lotes de Vencimiento', 90, 'Restaurando fechas de caducidad...')
    const lotesBackup = backupData.lotes_producto || []
    const lotesEsperados: ProductoEsperadoBackup[] = []

    for (let i = 0; i < lotesBackup.length; i++) {
      const lote = lotesBackup[i]
      if (!lote.fecha_vencimiento) {
        resumen.errores.push(`Lote ${i + 1}: falta la fecha de vencimiento.`)
        continue
      }

      // Usar únicamente el producto cuya restauración quedó confirmada.
      const prodIdFinal =
        lote.producto_id ? mapaProductosIdOriginal.get(lote.producto_id) : undefined

      // Si no existe el producto en el kiosco destino, omitir para evitar fallo de clave foránea FK
      if (!prodIdFinal || (!idsExistentes.has(prodIdFinal) && !idsProcesadosEnBackup.has(prodIdFinal))) {
        resumen.errores.push(`Lote ${i + 1}: no se pudo recuperar el producto asociado.`)
        continue
      }

      try {
        const campos = {
          producto_id: prodIdFinal,
          numero_lote: lote.numero_lote || null,
          fecha_vencimiento: lote.fecha_vencimiento,
          cantidad_inicial: Number(lote.cantidad_inicial) || 0,
          cantidad_actual: Number(lote.cantidad_actual) || 0,
          activo: lote.activo !== false,
        }
        const id = await guardarRegistroRestaurado('lotes_producto', backupData.kiosco.id, kioscoId, lote.id, campos)
        lotesEsperados.push({ id, campos })
        resumen.lotesRestaurados++
      } catch (error: unknown) {
        resumen.errores.push(`Lote ${i + 1}: ${error instanceof Error ? error.message : 'Error inesperado.'}`)
      }
    }

    if (resumen.errores.length === 0 && backupData.version === '4.0' && (productosEsperados.size > 0 || lotesEsperados.length > 0 || promocionesEsperadas.length > 0)) {
      try {
        reportar('FINALIZANDO', 'Verificando Restauración', 94, 'Comparando productos, stock y lotes con el servidor...')
        const { data, error } = await supabase.rpc('generar_snapshot_backup_ampliado', { p_kiosco_id: kioscoId })
        if (error) throw new Error('No se pudo verificar el catálogo restaurado en el servidor.')
        const verificacion = validarBackupJSON(JSON.stringify(data),kioscoId)
        if (!verificacion.valido || !verificacion.esMismoKiosco || verificacion.datos?.version !== '4.0') {
          throw new Error('El servidor no devolvió un respaldo válido del comercio para verificar.')
        }
        resumen.productosVerificados = verificarProductosBackup(
          [...productosEsperados].map(([id, campos]) => ({ id,campos })),verificacion.datos.productos)
        resumen.lotesVerificados = verificarLotesBackup(lotesEsperados, verificacion.datos.lotes_producto)
        resumen.promocionesVerificadas = verificarPromocionesBackup(promocionesEsperadas, verificacion.datos.promociones)
      } catch (error: unknown) {
        resumen.errores.push(error instanceof Error ? error.message : 'No se pudo verificar la restauración.')
      }
    }

    // Si el modo es REEMPLAZO TOTAL, desactivamos productos que no estuvieran en el backup
    if (modo === 'REEMPLAZO' && prodsExistentes && resumen.errores.length === 0) {
      reportar('PRODUCTOS', 'Ajustando Modo Reemplazo Total', 96, 'Desactivando artículos no incluidos en la copia...')
      const idsADesactivar = prodsExistentes.filter((p) => p.activo && !idsProcesadosEnBackup.has(p.id)).map((p) => p.id)

      if (idsADesactivar.length > 0) {
        for (let i = 0; i < idsADesactivar.length; i += CHUNK_SIZE) {
          const chunkIds = idsADesactivar.slice(i, i + CHUNK_SIZE)
          const { data: productosDesactivados, error: errorDesactivar } = await supabase.from('productos')
            .update({ activo: false }).eq('kiosco_id', kioscoId).in('id', chunkIds).select('id')
          if (errorDesactivar) {
            resumen.errores.push(`Desactivación de productos: ${errorDesactivar.message}`)
          } else {
            const confirmados = idsConfirmados(productosDesactivados)
            const cantidadConfirmada = chunkIds.filter((id) => confirmados.has(id)).length
            resumen.productosDesactivados += cantidadConfirmada
            if (cantidadConfirmada !== chunkIds.length) {
              resumen.errores.push(`Desactivación de productos: el servidor no confirmó ${chunkIds.length - cantidadConfirmada} artículos.`)
            }
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // PASO 7: FINALIZACIÓN Y LIMPIEZA DE CACHÉ
    // ─────────────────────────────────────────────────────────────
    reportar('FINALIZANDO', 'Finalizando Restauración', 98, 'Limpiando cachés locales del sistema...')

    if (resumen.errores.length === 0 && (opciones.restaurarConfiguracion || opciones.restaurarPreferencias)) {
      try {
        if (backupData.version !== '4.0' || backupData.kiosco.id !== kioscoId) throw new Error('La configuración sólo se recupera desde una copia 4.0 del mismo comercio')
        const ampliado = validarAmpliacionBackup({ configuracion_comercio: backupData.configuracion_comercio, saldos_snapshot: backupData.saldos_snapshot, preferencias_equipo: backupData.preferencias_equipo }, backupData.clientes, backupData.proveedores)
        if (opciones.restaurarConfiguracion) {
          const campos = ['rubro', 'nombre', 'direccion', 'telefono', 'cuit', 'iibb', 'inicio_actividades', 'condicion_iva', 'afip_punto_venta', 'afip_alicuota_iva', 'arqueo_ciego_obligatorio']
          const configuracion = Object.fromEntries(campos.filter(campo => campo in ampliado.configuracion_comercio)
            .map(campo => [campo, ampliado.configuracion_comercio[campo]]))
          const { data, error } = await supabase.rpc('restaurar_configuracion_backup', { p_kiosco_id: kioscoId, p_configuracion: configuracion })
          if (error || !data || typeof data !== 'object' || Array.isArray(data)
            || Object.entries(configuracion).some(([campo, valor]) => data[campo] !== valor)) throw new Error('El servidor no confirmó la restauración de la configuración')
        }
        if (opciones.restaurarPreferencias) {
          if (!ampliado.preferencias_equipo) throw new Error('La copia no contiene preferencias de este equipo')
          const { useAuthStore } = await import('../stores/authStore')
          const usuarioActual = useAuthStore.getState().usuario
          if (usuarioActual?.rol !== 'DUEÑO' || usuarioActual.kiosco_id !== kioscoId) throw new Error('Cambió el comercio activo; no se aplicaron preferencias a este equipo')
          restaurarPreferenciasEquipo(ampliado.preferencias_equipo)
        }
      } catch (error: unknown) { resumen.errores.push(error instanceof Error ? error.message : 'No se pudo recuperar la configuración') }
    }
    const completa = resumen.errores.length === 0
    reportar('FINALIZANDO', completa ? 'Completado' : 'Restauración incompleta', 100,
      completa ? 'Restauración integral finalizada con éxito.' : 'Se aplicaron cambios, pero quedaron registros sin recuperar.')

    return {
      ok: completa,
      mensaje: completa
        ? `Restauración completada: ${resumen.productosCreados} productos creados, ${resumen.productosActualizados} actualizados, ${resumen.categoriasCreadas} categorías nuevas.`
        : `Restauración incompleta: ${resumen.errores.length} errores. Los cambios ya aplicados se conservaron; revisá el informe antes de reintentar.`,
      resumen,
    }
  } catch (err: unknown) {
    console.error('Error durante restaurarBackupIntegral:', err)
    const mensaje = err instanceof Error ? err.message : 'Ocurrió un error inesperado al restaurar la copia de seguridad.'
    resumen.errores.push(mensaje)
    return {
      ok: false,
      mensaje,
      resumen,
    }
  } finally {
    // Una falla posterior no revierte las escrituras ya aplicadas en el servidor.
    try {
      clearCachedProductos(kioscoId)
      localStorage.removeItem('kiosko_cache_categorias')
      localStorage.removeItem(`kiosko_cache_categorias_${kioscoId}`)
      localStorage.removeItem('kiosko_cache_productos')
      localStorage.removeItem(`kiosko_cache_productos_${kioscoId}`)
      localStorage.removeItem(`kiosko_combos_${kioscoId}`)
    } catch (error: unknown) {
      console.warn('Aviso limpiando caché local:', error)
    }
  }
}
