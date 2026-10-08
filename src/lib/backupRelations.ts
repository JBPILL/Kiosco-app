interface ColeccionesRelacionadasBackup {
  kiosco: { id: string }
  productos: unknown
  categorias: unknown
  clientes: unknown
  proveedores: unknown
  promociones: unknown
  lotes_producto: unknown
}

function registro(valor: unknown, nombre: string): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error(`${nombre}: registro inválido.`)
  return valor as Record<string, unknown>
}

/** Sólo para snapshots completos 3.0/4.0; no remapea ni modifica la copia. */
export function validarRelacionesBackup(datos: ColeccionesRelacionadasBackup): void {
  const colecciones = ['productos','categorias','clientes','proveedores','promociones','lotes_producto'] as const
  const filas = new Map<string, Array<Record<string, unknown>>>()
  const ids = new Map<string, Set<string>>()
  for (const nombre of colecciones) {
    const contenido = datos[nombre]
    if (!Array.isArray(contenido)) throw new Error(`${nombre}: colección incompleta.`)
    const identificadores = new Set<string>()
    const registros = contenido.map((valor: unknown) => {
      const fila = registro(valor,nombre)
      if (typeof fila.id !== 'string' || !fila.id.trim() || identificadores.has(fila.id)) {
        throw new Error(`${nombre}: identificador ausente o duplicado.`)
      }
      if (fila.kiosco_id !== undefined && fila.kiosco_id !== datos.kiosco.id) {
        throw new Error(`${nombre}: registro de otro comercio.`)
      }
      identificadores.add(fila.id)
      return fila
    })
    filas.set(nombre,registros)
    ids.set(nombre,identificadores)
  }
  const referencia = (valor: unknown, destino: string, origen: string, obligatoria = false) => {
    if (!obligatoria && (valor === null || valor === undefined)) return
    if (typeof valor !== 'string' || !ids.get(destino)?.has(valor)) {
      throw new Error(`${origen}: referencia a ${destino} ausente de la copia.`)
    }
  }
  for (const producto of filas.get('productos') || []) {
    if (producto.es_combo === true) {
      throw new Error('El respaldo contiene combos físicos. Esta versión no recupera sus componentes; usá una restauración PostgreSQL verificada.')
    }
    referencia(producto.categoria_id,'categorias','productos')
    referencia(producto.proveedor_id,'proveedores','productos')
  }
  for (const promocion of filas.get('promociones') || []) {
    referencia(promocion.producto_id,'productos','promociones')
    referencia(promocion.categoria_id,'categorias','promociones')
    if (promocion.items_combo !== null && promocion.items_combo !== undefined) {
      if (!Array.isArray(promocion.items_combo)) throw new Error('promociones: componentes inválidos.')
      for (const valor of promocion.items_combo) {
        const item = registro(valor,'promociones')
        referencia(item.producto_id,'productos','promociones',true)
      }
    }
  }
  for (const lote of filas.get('lotes_producto') || []) {
    referencia(lote.producto_id,'productos','lotes_producto',true)
  }
}
