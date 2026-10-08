import type { ResumenRestauracion } from '../../lib/backupUtils'

type Conteos = Pick<ResumenRestauracion, 'productosVerificados' | 'lotesVerificados' | 'promocionesVerificadas' | 'combosVerificados'>

export function ResumenVerificacionBackup({ resumen }: { resumen: Conteos }) {
  const filas = [
    ['Productos: precios y stock', resumen.productosVerificados],
    ['Lotes: cantidades y producto asociado', resumen.lotesVerificados],
    ['Promociones: condiciones y componentes', resumen.promocionesVerificadas],
    ['Recetas de combos', resumen.combosVerificados],
  ] as const
  const comprobados = filas.filter(([, cantidad]) => cantidad !== undefined)
  if (!comprobados.length) return null
  return (
    <section aria-label="Registros comprobados en el servidor" className="text-xs text-emerald-800 dark:text-emerald-300">
      <p className="font-semibold">Registros comprobados en el servidor</p>
      <ul className="mt-1 space-y-1">
        {comprobados.map(([nombre, cantidad]) => <li key={nombre}>{nombre}: {cantidad}</li>)}
      </ul>
    </section>
  )
}
