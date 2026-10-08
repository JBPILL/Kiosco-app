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
  const productosVirtuales = new Set((filas.get('productos') || []).filter(p => p.es_combo === true).map(p => p.id))
  const productosPesables = new Set((filas.get('productos') || []).filter(p => p.es_pesable === true).map(p => p.id))
  for (const producto of filas.get('productos') || []) {
    if (producto.es_combo === true && !Array.isArray(producto.componentes_combo)) {
      throw new Error('El respaldo contiene combos sin sus componentes. Generá una copia nueva con el servicio de respaldo actualizado.')
    }
    if (producto.componentes_combo !== undefined) {
      if (!Array.isArray(producto.componentes_combo) || producto.componentes_combo.length > 500
        || (producto.es_combo === true && producto.componentes_combo.length === 0)
        || (producto.es_combo !== true && producto.componentes_combo.length !== 0)) throw new Error('productos: estructura del combo inválida.')
      const componentes = new Set<string>()
      for (const valor of producto.componentes_combo) {
        const item = registro(valor,'componentes_combo')
        referencia(item.componente_producto_id,'productos','componentes_combo',true)
        const id = item.componente_producto_id as string
        if (id === producto.id || componentes.has(id)
          || productosVirtuales.has(id)
          || typeof item.cantidad !== 'number' || !Number.isFinite(item.cantidad)
          || item.cantidad < 0.001 || item.cantidad > 999999
          || Number(item.cantidad.toFixed(3)) !== item.cantidad
          || (!productosPesables.has(id) && !Number.isInteger(item.cantidad))) throw new Error('componentes_combo: cantidad o referencia inválida.')
        componentes.add(id)
      }
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
