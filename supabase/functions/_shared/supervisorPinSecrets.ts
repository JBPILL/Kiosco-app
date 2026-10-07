/** Secretos del servidor: nunca importar desde componentes ni usar variables VITE_. */
export function leerPepperSupervisor(json: string | undefined, versionActual: string | undefined): {
  versionActual: string
  obtenerPepper: (version: string) => Promise<Uint8Array>
} {
  try {
    if (!json || json.length > 2000 || !versionActual || !/^[a-zA-Z0-9_-]{1,32}$/.test(versionActual)) throw new Error()
    const valores: unknown = JSON.parse(json)
    if (!valores || typeof valores !== 'object' || Array.isArray(valores)) throw new Error()
    const entradas = Object.entries(valores)
    if (!entradas.length || entradas.length > 8) throw new Error()
    const peppers = new Map<string, Uint8Array>()
    for (const [version, hex] of entradas) {
      if (!/^[a-zA-Z0-9_-]{1,32}$/.test(version) || typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error()
      peppers.set(version, Uint8Array.from(hex.match(/../g)!, byte => parseInt(byte, 16)))
    }
    if (!peppers.has(versionActual)) throw new Error()
    return { versionActual, obtenerPepper: async version => {
      const pepper = peppers.get(version)
      if (!pepper) throw new Error('Versión del secreto no disponible')
      return new Uint8Array(pepper)
    } }
  } catch { throw new Error('Secretos de supervisor no configurados') }
}
