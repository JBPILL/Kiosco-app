import type { DatosReparacion, EstadoReparacion, RegistroUnidad, TipoIdentificador } from '../types/electronica'

export const TRANSICIONES_REPARACION: Record<EstadoReparacion, readonly EstadoReparacion[]> = {
  RECIBIDA: ['DIAGNOSTICO', 'CANCELADA'], DIAGNOSTICO: ['PRESUPUESTADA', 'CANCELADA'],
  PRESUPUESTADA: ['AUTORIZADA', 'DIAGNOSTICO', 'CANCELADA'], AUTORIZADA: ['EN_REPARACION', 'CANCELADA'],
  EN_REPARACION: ['LISTA', 'CANCELADA'], LISTA: ['ENTREGADA', 'EN_REPARACION'], ENTREGADA: [], CANCELADA: [],
}
export const ETIQUETAS_REPARACION: Record<EstadoReparacion, string> = {
  RECIBIDA: 'Recibida', DIAGNOSTICO: 'En diagnóstico', PRESUPUESTADA: 'Presupuestada', AUTORIZADA: 'Autorizada',
  EN_REPARACION: 'En reparación', LISTA: 'Lista para retirar', ENTREGADA: 'Entregada', CANCELADA: 'Cancelada',
}
export function normalizarIdentificador(tipo: TipoIdentificador, valor: string): string {
  const normalizado = valor.trim().toUpperCase()
  if (tipo === 'SERIE') {
    if (!/^[A-Z0-9._/\-]{1,80}$/.test(normalizado)) throw new Error('Ingresá una serie válida de hasta 80 caracteres, sin espacios')
  } else if (tipo === 'IMEI') {
    if (!/^\d{15}$/.test(normalizado)) throw new Error('El IMEI debe tener 15 dígitos')
    const suma = [...normalizado].reduce((total, digito, indice) => {
      const n = Number(digito) * (indice % 2 === 1 ? 2 : 1)
      return total + (n > 9 ? n - 9 : n)
    }, 0)
    if (suma % 10 !== 0) throw new Error('El dígito de control del IMEI no es válido')
  } else throw new Error('Tipo de identificador inválido')
  return normalizado
}
export function validarRegistroUnidad(datos: RegistroUnidad): RegistroUnidad {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(datos.detalleVentaId)) throw new Error('Seleccioná un detalle de venta válido')
  const condiciones = datos.condiciones?.trim() || null
  const fecha = datos.garantiaHasta ? Date.parse(datos.garantiaHasta) : null
  if (datos.garantiaHasta && (!/^\d{4}-\d{2}-\d{2}$/.test(datos.garantiaHasta)
    || fecha === null || !Number.isFinite(fecha) || new Date(fecha).toISOString().slice(0, 10) !== datos.garantiaHasta
    || !condiciones || condiciones.length > 2000)) {
    throw new Error('La garantía requiere fecha válida y condiciones de hasta 2000 caracteres')
  }
  if (!datos.garantiaHasta && condiciones) throw new Error('Indicá la fecha de vencimiento de la garantía')
  return { ...datos, garantiaHasta: datos.garantiaHasta || null, identificador: normalizarIdentificador(datos.tipo, datos.identificador), condiciones }
}
function texto(valor: string | null, nombre: string, maximo: number, obligatorio = false): string | null {
  const limpio = valor?.trim() || null
  if ((obligatorio && !limpio) || (limpio && limpio.length > maximo)) throw new Error(`${nombre}: completá hasta ${maximo} caracteres`)
  return limpio
}
export function validarReparacion(datos: DatosReparacion, estadoAnterior?: EstadoReparacion): DatosReparacion {
  if (!(datos.estado in TRANSICIONES_REPARACION)) throw new Error('Estado de reparación inválido')
  if (!estadoAnterior && datos.estado !== 'RECIBIDA') throw new Error('Una reparación nueva comienza como recibida')
  if (estadoAnterior && (TRANSICIONES_REPARACION[estadoAnterior].length === 0
    || (datos.estado !== estadoAnterior && !TRANSICIONES_REPARACION[estadoAnterior].includes(datos.estado)))) throw new Error('El cambio de estado no está permitido')
  if (datos.presupuesto !== null && (!Number.isFinite(datos.presupuesto) || datos.presupuesto < 0
    || datos.presupuesto > 9999999999.99 || Math.abs(datos.presupuesto * 100 - Math.round(datos.presupuesto * 100)) > 0.0001)) throw new Error('Ingresá un presupuesto válido con hasta dos decimales')
  return {
    ...datos, cliente_nombre: texto(datos.cliente_nombre, 'Nombre', 160, true)!,
    cliente_contacto: texto(datos.cliente_contacto, 'Contacto', 120), equipo: texto(datos.equipo, 'Equipo', 160, true)!,
    identificador: texto(datos.identificador, 'Identificador', 80), informe_falla: texto(datos.informe_falla, 'Falla', 2000, true)!,
    diagnostico: texto(datos.diagnostico, 'Diagnóstico', 2000),
  }
}
