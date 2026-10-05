export type ErrorDb = { code?: string; message: string }
export type Resultado = { data?: unknown; error: ErrorDb | null }
export type Operacion = 'select' | 'insert' | 'update' | 'delete'

export interface Llamada {
  tabla: string
  op: Operacion
  payload?: unknown
  filtros: Array<[string, unknown]>
}

const VACIO: Resultado = { data: null, error: null }

export interface InvocacionFuncion {
  nombre: string
  options?: { body?: unknown }
}

export const db = {
  fijas: new Map<string, Resultado>(),
  colas: new Map<string, Resultado[]>(),
  lanzar: new Set<string>(),
  llamadas: [] as Llamada[],
  funciones: new Map<string, Resultado>(),
  invocaciones: [] as InvocacionFuncion[],
}

export function resetDb() {
  db.fijas.clear()
  db.colas.clear()
  db.lanzar.clear()
  db.llamadas = []
  db.funciones.clear()
  db.invocaciones = []
}

/** Respuesta permanente para `tabla.operacion` (ej. 'clientes.update'). */
export function responder(clave: string, resultado: Resultado) {
  db.fijas.set(clave, resultado)
}

/** Respuesta permanente para supabase.functions.invoke('nombre') */
export function responderFuncion(nombre: string, resultado: Resultado) {
  db.funciones.set(nombre, resultado)
}

export function invocacionesA(nombre: string): InvocacionFuncion[] {
  return db.invocaciones.filter(i => i.nombre === nombre)
}

/** Respuestas consumidas en orden; al agotarse se usa la fija o la vacía. */
export function encolar(clave: string, ...resultados: Resultado[]) {
  db.colas.set(clave, [...(db.colas.get(clave) ?? []), ...resultados])
}

export function llamadasA(tabla: string, op: Operacion): Llamada[] {
  return db.llamadas.filter(l => l.tabla === tabla && l.op === op)
}

function resolver(clave: string): Resultado {
  const cola = db.colas.get(clave)
  if (cola && cola.length > 0) return cola.shift() as Resultado
  return db.fijas.get(clave) ?? VACIO
}

function crearConsulta(tabla: string) {
  if (db.lanzar.has(tabla)) throw new Error(`supabase caído (${tabla})`)

  const llamada: Llamada = { tabla, op: 'select', filtros: [] }
  db.llamadas.push(llamada)

  const consulta: Record<string, unknown> = {}
  const encadenar = (nombre: string) => {
    consulta[nombre] = (...args: unknown[]) => {
      llamada.filtros.push([nombre, args])
      return consulta
    }
  }
  for (const m of ['select', 'eq', 'gte', 'not', 'order', 'limit', 'maybeSingle', 'single', 'in', 'lte', 'is', 'or', 'neq']) encadenar(m)

  for (const op of ['insert', 'update', 'delete'] as const) {
    consulta[op] = (payload?: unknown) => {
      llamada.op = op
      llamada.payload = payload
      return consulta
    }
  }

  consulta.then = (
    resolve: (r: Resultado) => unknown,
    reject: (e: unknown) => unknown
  ) => {
    const clave = `${tabla}.${llamada.op}`
    if (db.lanzar.has(clave)) return reject(new Error(`supabase caído (${clave})`))
    return resolve(resolver(clave))
  }
  return consulta
}

export function crearModuloSupabase() {
  return {
    supabaseUrl: 'http://localhost',
    supabaseAnonKey: 'test',
    createUnauthenticatedClient: () => ({}),
    supabase: {
      from: crearConsulta,
      functions: {
        invoke: async (nombre: string, options?: { body?: unknown }) => {
          db.invocaciones.push({ nombre, options })
          if (db.lanzar.has(`functions.${nombre}`)) {
            throw new Error(`supabase function caída (${nombre})`)
          }
          return db.funciones.get(nombre) ?? { data: null, error: null }
        },
      },
    },
  }
}

