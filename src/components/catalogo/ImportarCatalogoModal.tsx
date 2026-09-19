import { useState, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { formatPrecio } from '../../lib/utils'
import type { Categoria } from '../../types/database'
import toast from 'react-hot-toast'
import { v4 as uuidv4 } from 'uuid'

interface ProductoImportRow {
  codigo_barras: string | null
  descripcion: string
  categoriaNombre: string | null
  precio_costo: number
  precio_venta: number
  stock_actual: number
  stock_minimo: number
  esValido: boolean
  error?: string
}

interface ImportarCatalogoModalProps {
  isOpen: boolean
  onClose: () => void
  onImportCompletado: () => Promise<void> | void
  categorias: Categoria[]
  modoInicial?: 'NORMAL' | 'ROLLBACK'
  titulo?: string
}

/**
 * Tokenizador robusto de línea CSV con soporte de comillas dobles y separadores variables
 */
function parsearLineaCSV(linea: string, separador: string = ';'): string[] {
  const columnas: string[] = []
  let enComillas = false
  let buffer = ''

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '"') {
      if (enComillas && i + 1 < linea.length && linea[i + 1] === '"') {
        buffer += '"'
        i++
      } else {
        enComillas = !enComillas
      }
    } else if (c === separador && !enComillas) {
      columnas.push(buffer.trim())
      buffer = ''
    } else {
      buffer += c
    }
  }
  columnas.push(buffer.trim())
  return columnas
}

function normalizarTexto(txt: string): string {
  return txt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/**
 * Detecta inteligentemente la posición de las columnas según los nombres de encabezado
 */
function detectarIndicesColumnas(cabeceras: string[]): Record<string, number> {
  const indices: Record<string, number> = {
    descripcion: -1,
    codigo_barras: -1,
    categoria: -1,
    precio_costo: -1,
    precio_venta: -1,
    stock_actual: -1,
    stock_minimo: -1,
  }

  cabeceras.forEach((col, idx) => {
    const norm = normalizarTexto(col)
    if (
      indices.descripcion === -1 &&
      (norm.includes('descripcion') || norm === 'producto' || norm === 'nombre' || norm === 'articulo')
    ) {
      indices.descripcion = idx
    } else if (
      indices.codigo_barras === -1 &&
      (norm.includes('codigo') || norm.includes('barras') || norm === 'barcode' || norm === 'ean')
    ) {
      indices.codigo_barras = idx
    } else if (
      indices.categoria === -1 &&
      (norm.includes('categoria') || norm.includes('rubro') || norm.includes('category'))
    ) {
      indices.categoria = idx
    } else if (
      indices.precio_costo === -1 &&
      (norm.includes('costo') || norm === 'precio_costo')
    ) {
      indices.precio_costo = idx
    } else if (
      indices.precio_venta === -1 &&
      (norm.includes('venta') || norm === 'precio_venta' || (norm.includes('precio') && !norm.includes('costo')))
    ) {
      indices.precio_venta = idx
    } else if (
      indices.stock_actual === -1 &&
      (norm.includes('stock actual') || norm === 'stock_actual' || norm === 'stock' || norm === 'cantidad')
    ) {
      indices.stock_actual = idx
    } else if (
      indices.stock_minimo === -1 &&
      (norm.includes('minimo') || norm === 'stock_minimo')
    ) {
      indices.stock_minimo = idx
    }
  })

  // Fallback a posiciones predeterminadas de la plantilla clásica si no se reconocieron encabezados
  if (indices.descripcion === -1) {
    indices.codigo_barras = 0
    indices.descripcion = 1
    indices.categoria = 2
    indices.precio_costo = 3
    indices.precio_venta = 4
    indices.stock_actual = 5
    indices.stock_minimo = 6
  }

  return indices
}

export function ImportarCatalogoModal({
  isOpen,
  onClose,
  onImportCompletado,
  categorias,
  modoInicial = 'NORMAL',
  titulo,
}: ImportarCatalogoModalProps) {
  const { usuario } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [filas, setFilas] = useState<ProductoImportRow[]>([])
  const [actualizarExistentes, setActualizarExistentes] = useState(true)
  const [modoRollback, setModoRollback] = useState(modoInicial === 'ROLLBACK')
  const [procesando, setProcesando] = useState(false)
  const [progresoTexto, setProgresoTexto] = useState('')
  const [errorParsing, setErrorParsing] = useState<string | null>(null)

  const limpiarEstado = () => {
    setArchivo(null)
    setFilas([])
    setErrorParsing(null)
    setProgresoTexto('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCerrar = () => {
    if (procesando) return
    limpiarEstado()
    onClose()
  }

  // Descargar plantilla CSV de muestra
  const descargarPlantilla = () => {
    const encabezados = 'Descripción;Código de Barras;Categoría;Precio Costo;Precio Venta;Stock Actual;Stock Mínimo'
    const filasEjemplo = [
      'Coca Cola 500ml;7790895000997;Bebidas;850;1500;24;6',
      'Alfajor Jorgito Chocolate;7791234567890;Golosinas;400;800;50;10',
      'Papas Fritas Lays 85g;7799876543210;Snacks;900;1800;15;5',
      'Cigarrillos Marlboro Box 20;7791111222233;Cigarrillos;2200;3000;20;5',
      'Leche La Serenisima 1L;7794444555566;Lácteos;950;1400;12;4',
      'Caramelos Sugus x Unidad;;Golosinas;15;30;200;50',
    ]

    const contenidoCSV = `\uFEFF${encabezados}\r\n${filasEjemplo.join('\r\n')}`
    const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'plantilla_productos_kioskopos.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Parsear texto numérico tolerando número nativo, formato argentino (1.500,50 o 1500) y formato internacional ($1,500.00)
  const parsearNumero = (valor: any): number => {
    if (valor === null || valor === undefined || valor === '') return 0
    if (typeof valor === 'number') {
      return isNaN(valor) ? 0 : Math.round(valor)
    }
    let limpio = String(valor).trim().replace(/[$ ]/g, '')
    if (!limpio) return 0

    const tieneComa = limpio.includes(',')
    const tienePunto = limpio.includes('.')

    if (tieneComa && tienePunto) {
      const idxComa = limpio.lastIndexOf(',')
      const idxPunto = limpio.lastIndexOf('.')
      if (idxComa > idxPunto) {
        // Formato argentino: 1.500,50 -> miles punto, decimal coma
        limpio = limpio.replace(/\./g, '').replace(',', '.')
      } else {
        // Formato internacional: 1,500.50 -> miles coma, decimal punto
        limpio = limpio.replace(/,/g, '')
      }
    } else if (tieneComa) {
      limpio = limpio.replace(',', '.')
    } else if (tienePunto) {
      const partes = limpio.split('.')
      if (partes.length > 1 && partes.every((p, i) => i === 0 || p.length === 3)) {
        limpio = limpio.replace(/\./g, '')
      }
    }

    const num = parseFloat(limpio)
    return isNaN(num) ? 0 : Math.round(num)
  }

  // Procesar archivo CSV o XLSX
  const handleArchivoSeleccionado = async (file: File) => {
    setErrorParsing(null)
    setArchivo(file)

    const esXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')

    if (esXlsx) {
      // ── Rama XLSX con SheetJS ─────────────────────────────────────────────────
      try {
        // SheetJS es el estándar para leer cualquier formato .xlsx, incluido
        // los archivos corporativos con celdas combinadas generados por KioskoPOS
        const XLSX = await import('xlsx')
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })

        // Leer la primera hoja del archivo
        const sheetName = workbook.SheetNames[0]
        if (!sheetName) {
          setErrorParsing('El archivo Excel no contiene hojas de datos.')
          return
        }
        const sheet = workbook.Sheets[sheetName]
        // raw: true mantiene los números como números reales de JS (evita desfasaje de precios)
        const todasLasFilas: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: null,
          raw: true,
        })

        if (!todasLasFilas || todasLasFilas.length === 0) {
          setErrorParsing('El archivo Excel está vacío.')
          return
        }

        // Detectar si el usuario seleccionó un archivo de reporte contable o ventas
        const nombreArchivoLower = file.name.toLowerCase()
        const textoPrimerasFilas = todasLasFilas
          .slice(0, 8)
          .map((f) => (Array.isArray(f) ? f.map((c) => String(c ?? '')).join(' ') : ''))
          .join(' ')
          .toLowerCase()

        if (
          nombreArchivoLower.includes('reporte_ventas') ||
          textoPrimerasFilas.includes('reporte ejecutivo de ventas') ||
          textoPrimerasFilas.includes('registro detallado de comprobantes')
        ) {
          setErrorParsing(
            'El archivo seleccionado es un Reporte de Ventas. Este asistente es exclusivamente para el Catálogo de Productos y Stock. Tus ventas ya se encuentran registradas permanentemente en tu sistema y no requieren reimportación.'
          )
          return
        }

        if (
          nombreArchivoLower.includes('libro_contable') ||
          textoPrimerasFilas.includes('libro diario contable') ||
          textoPrimerasFilas.includes('variables contables')
        ) {
          setErrorParsing(
            'El archivo seleccionado es el Libro Diario Contable. Este documento es un balance de auditoría contable para tu contador o administración, no un catálogo de productos para importar.'
          )
          return
        }

        if (
          nombreArchivoLower.includes('libro_iva') ||
          textoPrimerasFilas.includes('libro iva ventas') ||
          textoPrimerasFilas.includes('conforme rg afip')
        ) {
          setErrorParsing(
            'El archivo seleccionado es el Libro IVA Ventas Digital de AFIP. Es un informe fiscal emitido para contabilidad y AFIP, no un catálogo de productos para importar.'
          )
          return
        }

        if (
          nombreArchivoLower.includes('movimientos_stock') ||
          textoPrimerasFilas.includes('kardex de movimientos de stock')
        ) {
          setErrorParsing(
            'El archivo seleccionado es el Historial de Movimientos de Stock (Kardex). Es un informe de auditoría histórica. Para restaurar el catálogo, seleccioná la copia de seguridad de catálogo (catalogo_valuacion_...).'
          )
          return
        }

        // Los archivos exportados por KioskoPOS tienen encabezado corporativo.
        // Buscar la fila de cabeceras detectando la que contenga palabras clave
        let indiceEncabezado = -1
        for (let i = 0; i < todasLasFilas.length; i++) {
          const fila = todasLasFilas[i]
          if (!fila) continue
          const lineaStr = fila.map((c) => String(c ?? '')).join(' ').toLowerCase()
          if (
            lineaStr.includes('descripci') ||
            lineaStr.includes('codigo de barras') ||
            lineaStr.includes('precio venta') ||
            lineaStr.includes('precio costo')
          ) {
            indiceEncabezado = i
            break
          }
        }

        if (indiceEncabezado === -1) {
          setErrorParsing('No se encontró la fila de encabezados en el archivo. Asegurate de usar un archivo exportado por KioskoPOS o con columnas estándar (Descripción, Precio Venta, etc.).')
          return
        }

        const cabeceras = todasLasFilas[indiceEncabezado].map((c) => String(c ?? ''))
        const indices = detectarIndicesColumnas(cabeceras)
        const filasParseadas: ProductoImportRow[] = []

        for (let i = indiceEncabezado + 1; i < todasLasFilas.length; i++) {
          const fila = todasLasFilas[i]
          if (!fila || fila.every((c) => c === null || c === undefined || String(c).trim() === '')) continue

          // Omitir fila de totales y resúmenes de valuación al final de la tabla
          const lineaFilaTexto = fila.map((c) => String(c ?? '')).join(' ').toLowerCase()
          if (
            lineaFilaTexto.includes('valuacion total') ||
            lineaFilaTexto.includes('valuación total') ||
            lineaFilaTexto.includes('total facturado') ||
            lineaFilaTexto.includes('totales acumulados') ||
            lineaFilaTexto.includes('total registros')
          ) {
            continue
          }

          const rawCodigo = indices.codigo_barras >= 0 ? fila[indices.codigo_barras] : null
          const codigoStr = rawCodigo !== null && rawCodigo !== undefined ? String(rawCodigo).trim() : null
          const codigoBarras =
            codigoStr === '—' || codigoStr === '-' || codigoStr === 'null' || !codigoStr ? null : codigoStr

          const descripcion = indices.descripcion >= 0 ? String(fila[indices.descripcion] ?? '').trim() : ''
          const catRaw = indices.categoria >= 0 ? String(fila[indices.categoria] ?? '').trim() : ''
          const categoriaNombre = catRaw === 'Sin categoría' || catRaw === '—' || !catRaw ? null : catRaw
          const precioCosto = indices.precio_costo >= 0 ? parsearNumero(fila[indices.precio_costo]) : 0
          const precioVenta = indices.precio_venta >= 0 ? parsearNumero(fila[indices.precio_venta]) : 0
          const stockActual = indices.stock_actual >= 0 ? parsearNumero(fila[indices.stock_actual]) : 0
          const stockMinimo = indices.stock_minimo >= 0 ? Math.max(0, parsearNumero(fila[indices.stock_minimo])) : 0

          // Omitir devoluciones de envases, combos promocionales o artículos virtuales ad-hoc
          const descNorm = descripcion.toLowerCase()
          const codNorm = (codigoBarras || '').toUpperCase()
          if (
            descNorm.startsWith('devolución') ||
            descNorm.startsWith('devolucion') ||
            descNorm.startsWith('combo ') ||
            codNorm.startsWith('COMBO-') ||
            (stockActual > 90000 && !codigoBarras)
          ) {
            continue
          }

          let esValido = true
          let error: string | undefined
          if (!descripcion) {
            esValido = false
            error = 'Falta descripción'
          } else if (precioVenta <= 0) {
            esValido = false
            error = 'Precio venta debe ser mayor a 0'
          }

          filasParseadas.push({ codigo_barras: codigoBarras, descripcion, categoriaNombre, precio_costo: precioCosto, precio_venta: precioVenta, stock_actual: stockActual, stock_minimo: stockMinimo, esValido, error })
        }

        if (filasParseadas.length === 0) {
          setErrorParsing('No se detectaron productos válidos en el archivo Excel. Verificá que sea un archivo de catálogo (no un reporte de ventas).')
          return
        }

        setFilas(filasParseadas)
      } catch (err) {
        console.error('Error parseando archivo XLSX con SheetJS:', err)
        setErrorParsing('Error al leer el archivo Excel. Verificá que sea un archivo de catálogo exportado por KioskoPOS.')
      }
    } else {
      // ── Rama CSV ─────────────────────────────────────────────────────────────
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const texto = e.target?.result as string
          if (!texto) {
            setErrorParsing('El archivo seleccionado está vacío.')
            return
          }

          const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
          if (lineas.length <= 1) {
            setErrorParsing('El archivo no contiene filas de datos.')
            return
          }

          const primeraLinea = lineas[0]
          const countPuntoComa = (primeraLinea.match(/;/g) || []).length
          const countComa = (primeraLinea.match(/,/g) || []).length
          const separador = countPuntoComa >= countComa ? ';' : ','

          const cabeceras = parsearLineaCSV(primeraLinea, separador).map((c) => c.replace(/^["']|["']$/g, ''))
          const indices = detectarIndicesColumnas(cabeceras)

          const filasParseadas: ProductoImportRow[] = []

          for (let i = 1; i < lineas.length; i++) {
            const linea = lineas[i]
            if (!linea) continue

            const columnas = parsearLineaCSV(linea, separador).map((c) => c.replace(/^["']|["']$/g, ''))
            if (columnas.length === 0 || columnas.every((c) => !c)) continue

            // Omitir filas de totales de auditoría
            const lineaTexto = columnas.join(' ').toLowerCase()
            if (
              lineaTexto.includes('valuacion total') ||
              lineaTexto.includes('valuación total') ||
              lineaTexto.includes('total facturado') ||
              lineaTexto.includes('totales acumulados') ||
              lineaTexto.includes('total registros')
            ) {
              continue
            }

            const rawCodigo = indices.codigo_barras >= 0 ? columnas[indices.codigo_barras] || null : null
            const codigoBarras =
              rawCodigo === '—' || rawCodigo === '-' || rawCodigo === 'null' || !rawCodigo ? null : rawCodigo.trim()

            const descripcion = indices.descripcion >= 0 ? (columnas[indices.descripcion] || '').trim() : ''
            const categoriaNombre = indices.categoria >= 0 ? (columnas[indices.categoria] || '').trim() || null : null
            const precioCosto = indices.precio_costo >= 0 ? parsearNumero(columnas[indices.precio_costo]) : 0
            const precioVenta = indices.precio_venta >= 0 ? parsearNumero(columnas[indices.precio_venta]) : 0
            const stockActual = indices.stock_actual >= 0 ? parsearNumero(columnas[indices.stock_actual]) : 0
            const stockMinimo = indices.stock_minimo >= 0 ? Math.max(0, parsearNumero(columnas[indices.stock_minimo])) : 0

            // Omitir devoluciones de envases, combos promocionales o artículos virtuales ad-hoc
            const descNorm = descripcion.toLowerCase()
            const codNorm = (codigoBarras || '').toUpperCase()
            if (
              descNorm.startsWith('devolución') ||
              descNorm.startsWith('devolucion') ||
              descNorm.startsWith('combo ') ||
              codNorm.startsWith('COMBO-') ||
              (stockActual > 90000 && !codigoBarras)
            ) {
              continue
            }

            let esValido = true
            let error: string | undefined
            if (!descripcion) {
              esValido = false
              error = 'Falta descripción'
            } else if (precioVenta <= 0) {
              esValido = false
              error = 'Precio venta debe ser mayor a 0'
            }

            filasParseadas.push({
              codigo_barras: codigoBarras,
              descripcion,
              categoriaNombre: categoriaNombre === 'Sin categoría' || categoriaNombre === '—' ? null : categoriaNombre,
              precio_costo: precioCosto,
              precio_venta: precioVenta,
              stock_actual: stockActual,
              stock_minimo: stockMinimo,
              esValido,
              error,
            })
          }

          if (filasParseadas.length === 0) {
            setErrorParsing('No se detectaron productos válidos en el archivo.')
            return
          }

          setFilas(filasParseadas)
        } catch (err) {
          console.error('Error parseando archivo CSV:', err)
          setErrorParsing('Error al leer el formato del archivo CSV. Verificá que sea un archivo válido.')
        }
      }

      reader.readAsText(file, 'UTF-8')
    }
  }

  // Confirmar e importar productos / ejecutar rollback a la base de datos
  const handleImportar = async () => {
    const kioscoId = usuario?.kiosco_id
    if (!kioscoId) {
      toast.error('No tenés un comercio activo identificado')
      return
    }

    const validas = filas.filter((f) => f.esValido)
    if (validas.length === 0) {
      toast.error('No hay filas válidas para importar')
      return
    }

    if (modoRollback) {
      const confirmacion = window.confirm(
        `Atención: Has activado el Modo Rollback Completo.\n\nSe restaurarán ${validas.length} productos del archivo y cualquier producto actual que NO figure en esta copia de seguridad será dado de baja.\n\n¿Deseas continuar?`
      )
      if (!confirmacion) return
    }

    setProcesando(true)
    setProgresoTexto('Verificando categorías y productos existentes...')

    try {
      const ahora = new Date().toISOString()

      // 1. Identificar categorías y asegurar su existencia
      const mapaCategorias = new Map<string, string>()
      categorias.forEach((c) => mapaCategorias.set(c.nombre.toLowerCase().trim(), c.id))

      const categoriasNuevasNombres = new Set<string>()
      validas.forEach((f) => {
        if (f.categoriaNombre) {
          const norm = f.categoriaNombre.toLowerCase().trim()
          if (!mapaCategorias.has(norm)) {
            categoriasNuevasNombres.add(f.categoriaNombre.trim())
          }
        }
      })

      if (categoriasNuevasNombres.size > 0) {
        setProgresoTexto('Sincronizando nuevas categorías...')
        const arrayNuevas = Array.from(categoriasNuevasNombres)
        for (const nombreCat of arrayNuevas) {
          const { data: catCreada, error: catErr } = await supabase
            .from('categorias')
            .insert({
              kiosco_id: kioscoId,
              nombre: nombreCat,
              color: '#6366f1',
              orden: mapaCategorias.size + 1,
            })
            .select('id, nombre')
            .single()

          if (!catErr && catCreada) {
            mapaCategorias.set(catCreada.nombre.toLowerCase().trim(), catCreada.id)
          }
        }
      }

      // 2. Traer productos existentes para resolver actualizaciones por código o por nombre
      setProgresoTexto('Consultando catálogo actual...')
      const { data: productosExistentes } = await supabase
        .from('productos')
        .select('id, codigo_barras, descripcion, stock_actual, activo')
        .eq('kiosco_id', kioscoId)

      const mapaExistentesPorBarcode = new Map<string, any>()
      const mapaExistentesPorNombre = new Map<string, any>()

      productosExistentes?.forEach((p) => {
        if (p.codigo_barras) mapaExistentesPorBarcode.set(p.codigo_barras.trim(), p)
        if (p.descripcion) mapaExistentesPorNombre.set(p.descripcion.toLowerCase().trim(), p)
      })

      const idsAfectados = new Set<string>()
      let insertadosCount = 0
      let actualizadosCount = 0
      const productosParaInsertar: any[] = []
      const movimientosStockParaInsertar: any[] = []

      // 3. Preparar filas para inserción y actualización
      setProgresoTexto('Procesando productos...')
      for (const row of validas) {
        const catId = row.categoriaNombre
          ? mapaCategorias.get(row.categoriaNombre.toLowerCase().trim()) || null
          : null

        const barcode = row.codigo_barras?.trim() || null
        const descNorm = row.descripcion.toLowerCase().trim()

        // Buscar coincidencia por código de barras o por nombre idéntico
        const existente = (barcode ? mapaExistentesPorBarcode.get(barcode) : null) || mapaExistentesPorNombre.get(descNorm)

        if (existente && actualizarExistentes) {
          idsAfectados.add(existente.id)

          const { error: updErr } = await supabase
            .from('productos')
            .update({
              codigo_barras: barcode || existente.codigo_barras,
              descripcion: row.descripcion,
              categoria_id: catId,
              precio_costo: row.precio_costo,
              precio_venta: row.precio_venta,
              stock_actual: row.stock_actual,
              stock_minimo: row.stock_minimo,
              activo: true,
              fecha_actualizacion: ahora,
            })
            .eq('id', existente.id)

          if (updErr) {
            console.error('Error actualizando producto existente en importación:', existente.id, updErr)
            continue
          }

          // Registrar movimiento de auditoría si varió el stock
          if (existente.stock_actual !== row.stock_actual) {
            movimientosStockParaInsertar.push({
              kiosco_id: kioscoId,
              producto_id: existente.id,
              tipo: 'AJUSTE',
              cantidad: row.stock_actual - (existente.stock_actual || 0),
              motivo: 'CONTEO',
              notas: 'Restauración / Rollback desde backup',
              usuario_id: usuario?.id || null,
              fecha: ahora,
            })
          }

          actualizadosCount++
        } else {
          const nuevoId = uuidv4()
          idsAfectados.add(nuevoId)

          productosParaInsertar.push({
            id: nuevoId,
            kiosco_id: kioscoId,
            codigo_barras: barcode,
            descripcion: row.descripcion,
            categoria_id: catId,
            precio_costo: row.precio_costo,
            precio_venta: row.precio_venta,
            stock_actual: row.stock_actual,
            stock_minimo: row.stock_minimo,
            es_favorito: false,
            activo: true,
            fecha_creacion: ahora,
            fecha_actualizacion: ahora,
          })
        }
      }

      // 4. Inserción en lotes de 100 productos
      if (productosParaInsertar.length > 0) {
        setProgresoTexto(`Guardando ${productosParaInsertar.length} productos nuevos...`)
        const LOTE_SIZE = 100
        for (let i = 0; i < productosParaInsertar.length; i += LOTE_SIZE) {
          const lote = productosParaInsertar.slice(i, i + LOTE_SIZE)
          const { error: insErr } = await supabase.from('productos').insert(lote)
          if (insErr) throw insErr
          insertadosCount += lote.length
        }
      }

      // 5. Registrar movimientos de stock generados
      if (movimientosStockParaInsertar.length > 0) {
        const LOTE_SIZE = 100
        for (let i = 0; i < movimientosStockParaInsertar.length; i += LOTE_SIZE) {
          const loteMov = movimientosStockParaInsertar.slice(i, i + LOTE_SIZE)
          try {
            await supabase.from('movimientos_stock').insert(loteMov)
          } catch {
            // Ignorar error no crítico de registro de stock
          }
        }
      }

      // 6. Si se activó "Rollback Completo", dar de baja productos no presentes en el backup
      let desactivadosCount = 0
      if (modoRollback && productosExistentes) {
        setProgresoTexto('Aplicando rollback estricto...')
        const huerfanos = productosExistentes.filter((p) => !idsAfectados.has(p.id) && p.activo !== false)
        for (const p of huerfanos) {
          await supabase.from('productos').update({ activo: false, fecha_actualizacion: ahora }).eq('id', p.id)
          desactivadosCount++
        }
      }

      // 7. Sincronizar de inmediato el catálogo completo en la memoria local (localStorage)
      setProgresoTexto('Sincronizando inventario local...')
      const { data: catalogoCompleto } = await supabase
        .from('productos')
        .select('*, categoria:categorias(id, nombre, color)')
        .eq('kiosco_id', kioscoId)
        .eq('activo', true)

      if (catalogoCompleto) {
        try {
          localStorage.setItem('kiosko_cache_productos', JSON.stringify(catalogoCompleto))
        } catch {}
      }

      const mensajeExito = modoRollback && desactivadosCount > 0
        ? `Rollback exitoso: ${actualizadosCount} actualizados, ${insertadosCount} creados, ${desactivadosCount} dados de baja.`
        : `Restauración completada: ${insertadosCount} creados, ${actualizadosCount} actualizados.`

      toast.success(mensajeExito, { duration: 6000 })

      await onImportCompletado()
      handleCerrar()
    } catch (err) {
      console.error('Error durante la restauración / importación:', err)
      toast.error('Ocurrió un error al guardar los productos en la base de datos')
    } finally {
      setProcesando(false)
      setProgresoTexto('')
    }
  }

  const filasValidasCount = filas.filter((f) => f.esValido).length
  const filasInvalidasCount = filas.length - filasValidasCount

  const tituloModal = titulo || (modoRollback ? 'Restaurar Copia de Seguridad (Rollback)' : 'Importar Catálogo (.XLSX / .CSV)')

  return (
    <Modal isOpen={isOpen} onClose={handleCerrar} title={tituloModal} size="xl">
      <div className="space-y-4">
        {/* Banner informativo y descarga de plantilla */}
        <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <p className="font-bold text-indigo-900 dark:text-indigo-200">
              Compatible con copias de seguridad de KioskoPOS y Excels externos
            </p>
            <p className="text-indigo-700 dark:text-indigo-400 mt-0.5">
              Reconoce automáticamente columnas de Descripción, Código de Barras, Categoría, Precios y Stock.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={descargarPlantilla}
            className="whitespace-nowrap bg-white dark:bg-gray-800 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
          >
            Descargar Plantilla CSV
          </Button>
        </div>

        {/* Selector de modo: Fusión vs Rollback */}
        <div className="p-3.5 bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
            Modalidad de Restauración
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setModoRollback(false)}
              className={`p-3 rounded-lg border text-left transition-all ${
                !modoRollback
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 shadow-xs'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              <p className="text-xs font-bold">Fusionar y Actualizar (Seguro)</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Actualiza los productos coincidentes y agrega los nuevos, sin tocar los productos no mencionados.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setModoRollback(true)}
              className={`p-3 rounded-lg border text-left transition-all ${
                modoRollback
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 shadow-xs'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Rollback Completo (Exacto)</p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                  Deshacer
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Vuelve el catálogo exactamente al estado del backup. Da de baja productos actuales no presentes en el archivo.
              </p>
            </button>
          </div>
        </div>

        {/* Zona de selección de archivo */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Seleccionar archivo (.XLSX o .CSV)
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleArchivoSeleccionado(f)
              }}
              className="block w-full text-xs text-gray-500 dark:text-gray-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-900/40 dark:file:text-indigo-300 cursor-pointer border border-gray-300 dark:border-gray-600 rounded-lg p-1 bg-white dark:bg-gray-800"
            />
            {archivo && (
              <Button type="button" variant="secondary" size="sm" onClick={limpiarEstado} disabled={procesando}>
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {errorParsing && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
            {errorParsing}
          </div>
        )}

        {/* Resumen y opciones si hay filas parseadas */}
        {filas.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
              <div className="flex gap-3">
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  Total detectado: <strong>{filas.length}</strong>
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Válidos: {filasValidasCount}
                </span>
                {filasInvalidasCount > 0 && (
                  <span className="text-red-500 font-semibold">
                    Con errores: {filasInvalidasCount}
                  </span>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300 select-none">
                <input
                  type="checkbox"
                  checked={actualizarExistentes}
                  onChange={(e) => setActualizarExistentes(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Actualizar si el código o nombre ya existen</span>
              </label>
            </div>

            {/* Vista previa de las primeras 15 filas */}
            <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-400">Código</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-400">Descripción</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-400">Categoría</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">Costo</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">Venta</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-800">
                  {filas.slice(0, 15).map((f, idx) => (
                    <tr key={idx} className={f.esValido ? '' : 'bg-red-50/50 dark:bg-red-950/20'}>
                      <td className="px-3 py-1.5">
                        {f.esValido ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            OK
                          </span>
                        ) : (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" title={f.error}>
                            {f.error}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-gray-600 dark:text-gray-400">
                        {f.codigo_barras || '—'}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-gray-900 dark:text-gray-100 max-w-[150px] truncate">
                        {f.descripcion}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">
                        {f.categoriaNombre || 'Sin categoría'}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-500">
                        {formatPrecio(f.precio_costo)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold text-gray-900 dark:text-gray-100">
                        {formatPrecio(f.precio_venta)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-700 dark:text-gray-300">
                        {f.stock_actual}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filas.length > 15 && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">
                Mostrando primeras 15 filas de {filas.length}...
              </p>
            )}
          </div>
        )}

        {/* Mensaje de progreso durante procesamiento */}
        {procesando && (
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg text-center space-y-1">
            <div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto" />
            <p className="text-xs text-indigo-700 dark:text-indigo-300 font-semibold">
              {progresoTexto || 'Procesando datos del catálogo...'}
            </p>
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-200 dark:border-gray-700">
          <Button type="button" variant="secondary" onClick={handleCerrar} disabled={procesando}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleImportar}
            disabled={procesando || filasValidasCount === 0}
            className={`text-white font-bold ${
              modoRollback
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {procesando
              ? 'Procesando...'
              : modoRollback
              ? `Ejecutar Rollback (${filasValidasCount})`
              : `Confirmar Importación (${filasValidasCount})`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
