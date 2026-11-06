const ERROR_FECHA = 'Ingresá una fecha válida con formato dd/mm/aaaa.'

/** Acepta el formato visible y fechas ISO ya guardadas, sin adivinar el siglo. */
export function normalizarFechaInicioActividades(valor: string | null | undefined): string {
  const texto = (valor ?? '').trim()
  if (!texto) return ''
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (!local && !iso) throw new Error(ERROR_FECHA)
  const dia = Number(local ? local[1] : iso![3])
  const mes = Number(local ? local[2] : iso![2])
  const anio = Number(local ? local[3] : iso![1])
  const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0)
  const dias = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (anio < 1 || mes < 1 || mes > 12 || dia < 1 || dia > dias[mes - 1]) throw new Error(ERROR_FECHA)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${String(anio).padStart(4, '0')}`
}

/** Máscara de escritura/pegado; la validez del calendario se comprueba al guardar. */
export function enmascararFechaInicioActividades(valor: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) {
    try { return normalizarFechaInicioActividades(valor) } catch { return valor }
  }
  const digitos = valor.replace(/\D/g, '').slice(0, 8)
  return [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4)].filter(Boolean).join('/')
}

export function errorFechaInicioActividades(valor: string): string | undefined {
  try { normalizarFechaInicioActividades(valor); return undefined } catch { return ERROR_FECHA }
}
