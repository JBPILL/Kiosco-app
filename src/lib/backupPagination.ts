interface Pagina<T> {
  data: T[] | null
  error: { message: string } | null
}

/** Lee hasta una página vacía, aun si el servidor reduce el tamaño solicitado. */
export async function leerColeccionPorId<T extends { id: string }>(
  consultar: (ultimoId: string | null) => PromiseLike<Pagina<T>>,
  nombre: string,
): Promise<T[]> {
  const filas: T[] = []
  const vistos = new Set<string>()
  let ultimoId: string | null = null
  for (;;) {
    const { data, error } = await consultar(ultimoId)
    if (error) throw new Error(`Error al leer ${nombre}: ${error.message}`)
    if (!Array.isArray(data)) throw new Error(`El servidor no confirmó la lectura de ${nombre}.`)
    if (data.length === 0) return filas
    for (const fila of data) {
      if (!fila.id || vistos.has(fila.id)) throw new Error(`La lectura de ${nombre} no avanzó de forma consistente.`)
      vistos.add(fila.id)
      filas.push(fila)
    }
    ultimoId = data[data.length - 1].id
  }
}
