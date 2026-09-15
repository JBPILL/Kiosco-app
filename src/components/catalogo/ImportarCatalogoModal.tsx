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
}

export function ImportarCatalogoModal({
  isOpen,
  onClose,
  onImportCompletado,
  categorias,
}: ImportarCatalogoModalProps) {
  const { usuario } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [filas, setFilas] = useState<ProductoImportRow[]>([])
  const [actualizarExistentes, setActualizarExistentes] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [errorParsing, setErrorParsing] = useState<string | null>(null)

  const limpiarEstado = () => {
    setArchivo(null)
    setFilas([])
    setErrorParsing(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCerrar = () => {
    if (procesando) return
    limpiarEstado()
    onClose()
  }

  // Descargar plantilla CSV de muestra
  const descargarPlantilla = () => {
    const encabezados = 'codigo_barras,descripcion,categoria,precio_costo,precio_venta,stock_actual,stock_minimo'
    const filasEjemplo = [
      '7790895000997,Coca Cola 500ml,Bebidas,850,1500,24,6',
      '7791234567890,Alfajor Jorgito Chocolate,Golosinas,400,800,50,10',
      '7799876543210,Papas Fritas Lays 85g,Snacks,900,1800,15,5',
      '7791111222233,Cigarrillos Marlboro Box 20,Cigarrillos,2200,3000,20,5',
      '7794444555566,Leche La Serenisima 1L,Lácteos,950,1400,12,4',
      ',Caramelos Sugus x Unidad,Golosinas,15,30,200,50',
    ]

    const contenidoCSV = `\uFEFF${encabezados}\n${filasEjemplo.join('\n')}`
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

  // Parsear texto numérico tolerando formato argentino (1.500,50 o 1500.50 o 1500)
  const parsearNumero = (valor: string): number => {
    if (!valor) return 0
    let limpio = valor.toString().trim().replace(/[$ ]/g, '')
    if (limpio.includes(',') && limpio.includes('.')) {
      limpio = limpio.replace(/\./g, '').replace(',', '.')
    } else if (limpio.includes(',')) {
      limpio = limpio.replace(',', '.')
    }
    const num = parseFloat(limpio)
    return isNaN(num) ? 0 : Math.round(num)
  }

  // Procesar archivo CSV
  const handleArchivoSeleccionado = (file: File) => {
    setErrorParsing(null)
    setArchivo(file)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const texto = e.target?.result as string
        if (!texto) {
          setErrorParsing('El archivo está vacío.')
          return
        }

        // Detectar separador (; o ,)
        const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        if (lineas.length <= 1) {
          setErrorParsing('El archivo no contiene filas de datos.')
          return
        }

        const primeraLinea = lineas[0]
        const separador = primeraLinea.includes(';') ? ';' : ','

        const filasParseadas: ProductoImportRow[] = []

        // Omitir cabecera (primera línea)
        for (let i = 1; i < lineas.length; i++) {
          const linea = lineas[i]
          if (!linea) continue

          const columnas = linea.split(separador).map((c) => c.trim().replace(/^["']|["']$/g, ''))

          const codigoBarras = columnas[0] || null
          const descripcion = columnas[1] || ''
          const categoriaNombre = columnas[2] || null
          const precioCosto = parsearNumero(columnas[3])
          const precioVenta = parsearNumero(columnas[4])
          const stockActual = Math.max(0, parsearNumero(columnas[5]))
          const stockMinimo = Math.max(0, parsearNumero(columnas[6]))

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
            categoriaNombre,
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
        console.error('Error parseando CSV:', err)
        setErrorParsing('Error al leer el formato del archivo CSV.')
      }
    }

    reader.readAsText(file, 'UTF-8')
  }

  // Confirmar e importar productos a la base de datos
  const handleImportar = async () => {
    const kioscoId = usuario?.kiosco_id
    if (!kioscoId) {
      toast.error('No tenés un kiosco activo')
      return
    }

    const validas = filas.filter((f) => f.esValido)
    if (validas.length === 0) {
      toast.error('No hay filas válidas para importar')
      return
    }

    setProcesando(true)

    try {
      const ahora = new Date().toISOString()

      // 1. Identificar categorías únicas en el CSV y crear las que no existan
      const mapaCategorias = new Map<string, string>() // nombreMinuscula -> id
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

      // 2. Consultar productos existentes del kiosco para manejar duplicados o actualización
      const { data: productosExistentes } = await supabase
        .from('productos')
        .select('id, codigo_barras, descripcion')
        .eq('kiosco_id', kioscoId)

      const mapaExistentesPorBarcode = new Map<string, string>()
      productosExistentes?.forEach((p) => {
        if (p.codigo_barras) mapaExistentesPorBarcode.set(p.codigo_barras.trim(), p.id)
      })

      let insertadosCount = 0
      let actualizadosCount = 0

      // 3. Preparar filas para insert y updates
      const productosParaInsertar: any[] = []

      for (const row of validas) {
        const catId = row.categoriaNombre
          ? mapaCategorias.get(row.categoriaNombre.toLowerCase().trim()) || null
          : null

        const barcode = row.codigo_barras?.trim() || null
        const idExistente = barcode ? mapaExistentesPorBarcode.get(barcode) : null

        if (idExistente && actualizarExistentes) {
          // Actualizar producto existente
          await supabase
            .from('productos')
            .update({
              descripcion: row.descripcion,
              categoria_id: catId,
              precio_costo: row.precio_costo,
              precio_venta: row.precio_venta,
              stock_actual: row.stock_actual,
              stock_minimo: row.stock_minimo,
              fecha_actualizacion: ahora,
            })
            .eq('id', idExistente)

          actualizadosCount++
        } else {
          // Nuevo producto
          productosParaInsertar.push({
            id: uuidv4(),
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

      // Inserción en lotes de 100 productos
      if (productosParaInsertar.length > 0) {
        const LOTE_SIZE = 100
        for (let i = 0; i < productosParaInsertar.length; i += LOTE_SIZE) {
          const lote = productosParaInsertar.slice(i, i + LOTE_SIZE)
          const { error: insErr } = await supabase.from('productos').insert(lote)
          if (insErr) throw insErr
          insertadosCount += lote.length
        }
      }

      toast.success(
        `Importación completada: ${insertadosCount} creados, ${actualizadosCount} actualizados`
      )

      await onImportCompletado()
      handleCerrar()
    } catch (err) {
      console.error('Error durante la importación masiva:', err)
      toast.error('Ocurrió un error al guardar los productos en la base de datos')
    } finally {
      setProcesando(false)
    }
  }

  const filasValidasCount = filas.filter((f) => f.esValido).length
  const filasInvalidasCount = filas.length - filasValidasCount

  return (
    <Modal isOpen={isOpen} onClose={handleCerrar} title="Importar Catálogo Masivo (.CSV)" size="xl">
      <div className="space-y-4">
        {/* Banner informativo y descarga de plantilla */}
        <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <p className="font-bold text-indigo-900 dark:text-indigo-200">¿No tenés el formato exacto?</p>
            <p className="text-indigo-700 dark:text-indigo-400">
              Descargá nuestra plantilla de ejemplo con encabezados y productos de muestra.
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

        {/* Zona de selección de archivo */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Seleccionar archivo .CSV
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
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
            <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 bg-gray-50 dark:bg-gray-750 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
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
                <span>Actualizar si el código de barras ya existe</span>
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
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {procesando ? 'Importando...' : `Confirmar Importación (${filasValidasCount})`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
