/**
 * Módulo de Copia de Seguridad Integral (Full Backup) y Restauración para Kioscos
 * Permite descargar y restaurar en 1 solo clic un archivo JSON estructurado con la totalidad
 * de datos del comercio (productos, categorías, clientes, proveedores, promociones y lotes)
 * para resguardo ante contingencias, migración o recuperación de desastres.
 */

import { supabase } from './supabase'
import { descargarArchivo, sanitizarNombreArchivo } from './exportUtils'
import { clearCachedProductos } from './utils'

export interface BackupData {
  version: '2.0'
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

/**
 * Genera y descarga un snapshot completo del kiosco en formato JSON
 */
export async function generarBackupIntegral(
  kioscoId: string,
  kioscoNombre?: string
): Promise<{ ok: boolean; mensaje: string }> {
  if (!kioscoId) {
    return { ok: false, mensaje: 'ID de comercio no especificado.' }
  }

  try {
    const [
      prodsRes,
      catsRes,
      clientesRes,
      provsRes,
      promosRes,
      lotesRes,
    ] = await Promise.all([
      supabase.from('productos').select('*').eq('kiosco_id', kioscoId).limit(50000),
      supabase.from('categorias').select('*').eq('kiosco_id', kioscoId).limit(50000),
      supabase.from('clientes').select('*').eq('kiosco_id', kioscoId).limit(50000),
      supabase.from('proveedores').select('*').eq('kiosco_id', kioscoId).limit(50000),
      supabase.from('promociones').select('*').eq('kiosco_id', kioscoId).limit(50000),
      supabase.from('lotes_producto').select('*').eq('kiosco_id', kioscoId).limit(50000),
    ])

    const productos = prodsRes.data || []
    const categorias = catsRes.data || []
    const clientes = clientesRes.data || []
    const proveedores = provsRes.data || []
    const promociones = promosRes.data || []
    const lotes = lotesRes.data || []

    const backupPayload: BackupData = {
      version: '2.0',
      app: 'KioskoApp',
      exportDate: new Date().toISOString(),
      kiosco: {
        id: kioscoId,
        nombre: kioscoNombre || 'Kiosco',
      },
      estadisticas: {
        totalProductos: productos.length,
        totalCategorias: categorias.length,
        totalClientes: clientes.length,
        totalProveedores: proveedores.length,
        totalPromociones: promociones.length,
        totalLotes: lotes.length,
      },
      productos,
      categorias,
      clientes,
      proveedores,
      promociones,
      lotes_producto: lotes,
    }

    const jsonStr = JSON.stringify(backupPayload, null, 2)
    const fechaHora = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const nombreSanitizado = sanitizarNombreArchivo(kioscoNombre || 'kiosco')
    const fileName = `backup_integral_${nombreSanitizado}_${fechaHora}.json`

    descargarArchivo(jsonStr, fileName, 'application/json;charset=utf-8;')

    return {
      ok: true,
      mensaje: `Copia de seguridad integral descargada con éxito (${productos.length} productos, ${clientes.length} clientes, ${promociones.length} promociones).`,
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
    version: parsed.version || '2.0',
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
  onProgreso?: (progreso: ProgresoRestauracion) => void
): Promise<ResultadoRestauracion> {
  if (!kioscoId) {
    return { ok: false, mensaje: 'ID de comercio no especificado para la restauración.' }
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
    // ─────────────────────────────────────────────────────────────
    // PASO 1: CATEGORÍAS (Mapeo Nombre/ID -> ID Actual)
    // ─────────────────────────────────────────────────────────────
    reportar('CATEGORIAS', 'Sincronizando Categorías', 5, 'Consultando categorías existentes...')

    const { data: categoriasExistentes, error: errCats } = await supabase
      .from('categorias')
      .select('id, nombre, orden')
      .eq('kiosco_id', kioscoId)

    if (errCats) throw new Error(`Error al leer categorías: ${errCats.message}`)

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
      if (!nombreNorm) continue

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
        } else if (errInsertCat) {
          resumen.errores.push(`Categoría "${cat.nombre}": ${errInsertCat.message}`)
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

    const { data: proveedoresExistentes, error: errProvs } = await supabase
      .from('proveedores')
      .select('id, nombre, cuit')
      .eq('kiosco_id', kioscoId)

    if (errProvs) throw new Error(`Error al leer proveedores: ${errProvs.message}`)

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
      if (!nombreNorm) continue

      const idExistente =
        mapaProveedoresPorNombre.get(nombreNorm) || (prov.cuit ? mapaProveedoresPorNombre.get(prov.cuit.trim()) : null)

      if (idExistente) {
        mapaProveedoresPorIdOriginal.set(prov.id, idExistente)
        // Actualizar datos de contacto si están presentes
        await supabase
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
        resumen.proveedoresActualizados++
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
        } else if (errInsertProv) {
          resumen.errores.push(`Proveedor "${prov.nombre}": ${errInsertProv.message}`)
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

    const { data: clientesExistentes, error: errCli } = await supabase
      .from('clientes')
      .select('id, nombre, dni_cuit')
      .eq('kiosco_id', kioscoId)

    if (errCli) throw new Error(`Error al leer clientes: ${errCli.message}`)

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
      if (!nombreNorm) continue

      const idExistente =
        mapaClientesPorNombre.get(nombreNorm) ||
        (cli.dni_cuit && cli.dni_cuit.trim().length > 0 ? mapaClientesPorNombre.get(cli.dni_cuit.trim()) : null)

      if (idExistente) {
        await supabase
          .from('clientes')
          .update({
            telefono: cli.telefono || null,
            dni_cuit: cli.dni_cuit || null,
            direccion: cli.direccion || null,
            limite_credito: cli.limite_credito !== undefined ? cli.limite_credito : null,
            notas: cli.notas || null,
          })
          .eq('id', idExistente)
        resumen.clientesActualizados++
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
        } else if (errInsertCli) {
          resumen.errores.push(`Cliente "${cli.nombre}": ${errInsertCli.message}`)
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

    const { data: prodsExistentes, error: errProds } = await supabase
      .from('productos')
      .select('id, codigo_barras, descripcion, activo')
      .eq('kiosco_id', kioscoId)

    if (errProds) throw new Error(`Error al leer productos: ${errProds.message}`)

    const mapaProdsPorCodigo = new Map<string, any>()
    const mapaProdsPorDesc = new Map<string, any>()
    const mapaProductosIdOriginal = new Map<string, string>()
    const idsExistentes = new Set<string>()

    prodsExistentes?.forEach((p) => {
      idsExistentes.add(p.id)
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

            // Buscar si ya existe por código o descripción
            const prodExistente =
              (codeNorm ? mapaProdsPorCodigo.get(codeNorm) : null) || (descNorm ? mapaProdsPorDesc.get(descNorm) : null)

            const datosProducto = {
              kiosco_id: kioscoId,
              descripcion: prod.descripcion.trim(),
              precio_costo: Number(prod.precio_costo) || 0,
              precio_venta: Number(prod.precio_venta) || 0,
              stock_actual: Number(prod.stock_actual) || 0,
              stock_minimo: Number(prod.stock_minimo) ?? 5,
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
              idsProcesadosEnBackup.add(prodExistente.id)
              if (prod.id) {
                mapaProductosIdOriginal.set(prod.id, prodExistente.id)
              }
              const { error: errUpd } = await supabase
                .from('productos')
                .update({
                  ...datosProducto,
                  fecha_actualizacion: new Date().toISOString(),
                })
                .eq('id', prodExistente.id)

              if (!errUpd) {
                resumen.productosActualizados++
              } else {
                resumen.errores.push(`Producto "${prod.descripcion}": ${errUpd.message}`)
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
              } else if (errIns) {
                resumen.errores.push(`Producto "${prod.descripcion}": ${errIns.message}`)
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

    // Si el modo es REEMPLAZO TOTAL, desactivamos productos que no estuvieran en el backup
    if (modo === 'REEMPLAZO' && prodsExistentes) {
      reportar('PRODUCTOS', 'Ajustando Modo Reemplazo Total', 76, 'Desactivando artículos no incluidos en la copia...')
      const idsADesactivar = prodsExistentes.filter((p) => p.activo && !idsProcesadosEnBackup.has(p.id)).map((p) => p.id)

      if (idsADesactivar.length > 0) {
        for (let i = 0; i < idsADesactivar.length; i += CHUNK_SIZE) {
          const chunkIds = idsADesactivar.slice(i, i + CHUNK_SIZE)
          await supabase.from('productos').update({ activo: false }).in('id', chunkIds)
        }
        resumen.productosDesactivados = idsADesactivar.length
      }
    }

    // ─────────────────────────────────────────────────────────────
    // PASO 5: PROMOCIONES Y COMBOS
    // ─────────────────────────────────────────────────────────────
    reportar('PROMOCIONES', 'Restaurando Promociones y Combos', 80, 'Restaurando promociones comerciales...')
    const promocionesBackup = backupData.promociones || []

    for (let i = 0; i < promocionesBackup.length; i++) {
      const promo = promocionesBackup[i]
      if (!promo.nombre) continue

      try {
        const { error: errPromo } = await supabase.from('promociones').insert({
          kiosco_id: kioscoId,
          nombre: promo.nombre.trim(),
          tipo: promo.tipo || 'DESCUENTO_PORCENTAJE',
          valor: Number(promo.valor) || 0,
          dias_semana: Array.isArray(promo.dias_semana) ? promo.dias_semana : [1, 2, 3, 4, 5, 6, 7],
          hora_desde: promo.hora_desde || null,
          hora_hasta: promo.hora_hasta || null,
          activo: promo.activo !== false,
          fecha_desde: promo.fecha_desde || null,
          fecha_hasta: promo.fecha_hasta || null,
        })
        if (!errPromo) resumen.promocionesRestauradas++
      } catch {
        // Ignorar si la promo ya existía o falla opcional
      }
    }

    // ─────────────────────────────────────────────────────────────
    // PASO 6: LOTES DE VENCIMIENTO (FEFO)
    // ─────────────────────────────────────────────────────────────
    reportar('LOTES', 'Restaurando Lotes de Vencimiento', 90, 'Restaurando fechas de caducidad...')
    const lotesBackup = backupData.lotes_producto || []

    for (let i = 0; i < lotesBackup.length; i++) {
      const lote = lotesBackup[i]
      if (!lote.fecha_vencimiento) continue

      // Resolver ID del producto: si venía con ID original mapeado, o directo si coincide
      const prodIdFinal =
        (lote.producto_id ? mapaProductosIdOriginal.get(lote.producto_id) : null) || lote.producto_id

      // Si no existe el producto en el kiosco destino, omitir para evitar fallo de clave foránea FK
      if (!prodIdFinal || (!idsExistentes.has(prodIdFinal) && !idsProcesadosEnBackup.has(prodIdFinal))) {
        continue
      }

      try {
        const { error: errLote } = await supabase.from('lotes_producto').insert({
          kiosco_id: kioscoId,
          producto_id: prodIdFinal,
          numero_lote: lote.numero_lote || null,
          fecha_vencimiento: lote.fecha_vencimiento,
          cantidad_inicial: Number(lote.cantidad_inicial) || 0,
          cantidad_actual: Number(lote.cantidad_actual) || 0,
          activo: lote.activo !== false,
        })
        if (!errLote) resumen.lotesRestaurados++
      } catch {
        // Ignorar fallas menores en lotes huérfanos
      }
    }

    // ─────────────────────────────────────────────────────────────
    // PASO 7: FINALIZACIÓN Y LIMPIEZA DE CACHÉ
    // ─────────────────────────────────────────────────────────────
    reportar('FINALIZANDO', 'Finalizando Restauración', 98, 'Limpiando cachés locales del sistema...')

    try {
      clearCachedProductos(kioscoId)
      localStorage.removeItem('kiosko_cache_categorias')
      localStorage.removeItem(`kiosko_cache_categorias_${kioscoId}`)
      localStorage.removeItem('kiosko_cache_productos')
      localStorage.removeItem(`kiosko_cache_productos_${kioscoId}`)
    } catch (e) {
      console.warn('Aviso limpiando caché local:', e)
    }

    reportar('FINALIZANDO', 'Completado', 100, 'Restauración integral finalizada con éxito.')

    return {
      ok: true,
      mensaje: `Restauración completada: ${resumen.productosCreados} productos creados, ${resumen.productosActualizados} actualizados, ${resumen.categoriasCreadas} categorías nuevas.`,
      resumen,
    }
  } catch (err: any) {
    console.error('Error durante restaurarBackupIntegral:', err)
    return {
      ok: false,
      mensaje: err?.message || 'Ocurrió un error inesperado al restaurar la copia de seguridad.',
      resumen,
    }
  }
}
