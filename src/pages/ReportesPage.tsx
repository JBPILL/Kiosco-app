import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { formatPrecio, formatFecha, labelMedioPago } from '../lib/utils'

interface ResumenDiario {
  totalVentas: number
  cantidadVentas: number
  ventaPromedio: number
  porMedioPago: { medio: string; total: number; cantidad: number }[]
}

interface VentaResumen {
  id: string
  fecha_hora: string
  total: number
  estado: string
  pagos: { medio_pago: string; monto: number }[]
  detalles: { cantidad: number; producto: { descripcion: string }; subtotal: number }[]
}

export function ReportesPage() {
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0])
  const [ventas, setVentas] = useState<VentaResumen[]>([])
  const [resumen, setResumen] = useState<ResumenDiario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [ventaExpandida, setVentaExpandida] = useState<string | null>(null)

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    const inicioDelDia = `${fecha}T00:00:00`
    const finDelDia = `${fecha}T23:59:59`

    // Cargar ventas del día con detalles y pagos
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        id, fecha_hora, total, estado,
        pagos:pagos_venta(medio_pago, monto),
        detalles:detalles_venta(cantidad, subtotal, producto:productos(descripcion))
      `)
      .gte('fecha_hora', inicioDelDia)
      .lte('fecha_hora', finDelDia)
      .eq('estado', 'COMPLETADA')
      .order('fecha_hora', { ascending: false })

    if (error) {
      console.error('Error cargando ventas:', error)
      setCargando(false)
      return
    }

    const ventasData = (data || []) as unknown as VentaResumen[]
    setVentas(ventasData)

    // Calcular resumen
    const totalVentas = ventasData.reduce((sum, v) => sum + v.total, 0)
    const cantidadVentas = ventasData.length
    const ventaPromedio = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0

    // Agrupar por medio de pago
    const mediosMap = new Map<string, { total: number; cantidad: number }>()
    for (const venta of ventasData) {
      for (const pago of venta.pagos) {
        const actual = mediosMap.get(pago.medio_pago) || { total: 0, cantidad: 0 }
        mediosMap.set(pago.medio_pago, {
          total: actual.total + pago.monto,
          cantidad: actual.cantidad + 1,
        })
      }
    }
    const porMedioPago = Array.from(mediosMap.entries()).map(([medio, data]) => ({
      medio,
      ...data,
    }))

    setResumen({ totalVentas, cantidadVentas, ventaPromedio, porMedioPago })
    setCargando(false)
  }, [fecha])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const cambiarDia = (dias: number) => {
    const nuevaFecha = new Date(fecha)
    nuevaFecha.setDate(nuevaFecha.getDate() + dias)
    setFecha(nuevaFecha.toISOString().split('T')[0])
  }

  const esHoy = fecha === new Date().toISOString().split('T')[0]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">📈 Reportes</h1>

      {/* Selector de fecha */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3">
        <button onClick={() => cambiarDia(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-lg">◀️</button>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="flex-1 text-center text-lg font-medium border-none focus:ring-0"
        />
        <button
          onClick={() => cambiarDia(1)}
          disabled={esHoy}
          className="p-2 rounded-lg hover:bg-gray-100 text-lg disabled:opacity-30"
        >
          ▶️
        </button>
        {!esHoy && (
          <button
            onClick={() => setFecha(new Date().toISOString().split('T')[0])}
            className="px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-medium hover:bg-indigo-200"
          >
            Hoy
          </button>
        )}
      </div>

      {cargando ? (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : (
        <>
          {/* Tarjetas de resumen */}
          {resumen && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Total facturado</p>
                <p className="text-2xl font-bold text-indigo-600">{formatPrecio(resumen.totalVentas)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Cantidad de ventas</p>
                <p className="text-2xl font-bold text-gray-900">{resumen.cantidadVentas}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Ticket promedio</p>
                <p className="text-2xl font-bold text-gray-900">{formatPrecio(resumen.ventaPromedio)}</p>
              </div>
            </div>
          )}

          {/* Desglose por medio de pago */}
          {resumen && resumen.porMedioPago.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Desglose por medio de pago</h3>
              <div className="space-y-2">
                {resumen.porMedioPago.map((mp) => (
                  <div key={mp.medio} className="flex items-center justify-between py-2 border-b border-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{labelMedioPago(mp.medio)}</span>
                      <span className="text-xs text-gray-400">({mp.cantidad} ops.)</span>
                    </div>
                    <span className="font-bold">{formatPrecio(mp.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lista de ventas */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Ventas del día</h3>
            {ventas.length === 0 ? (
              <p className="text-center text-gray-400 py-8">No hay ventas este día</p>
            ) : (
              <div className="space-y-2">
                {ventas.map((venta) => (
                  <div key={venta.id} className="border border-gray-100 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setVentaExpandida(ventaExpandida === venta.id ? null : venta.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
                    >
                      <div>
                        <span className="text-sm text-gray-500">{formatFecha(venta.fecha_hora)}</span>
                        <span className="ml-2 text-xs text-gray-400">
                          {venta.detalles.length} item{venta.detalles.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className="font-bold text-gray-900">{formatPrecio(venta.total)}</span>
                    </button>
                    {ventaExpandida === venta.id && (
                      <div className="px-4 pb-3 border-t border-gray-100 bg-gray-50">
                        {venta.detalles.map((det, i) => (
                          <div key={i} className="flex justify-between text-sm py-1">
                            <span className="text-gray-600">
                              {det.cantidad}x {det.producto.descripcion}
                            </span>
                            <span className="text-gray-900">{formatPrecio(det.subtotal)}</span>
                          </div>
                        ))}
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          {venta.pagos.map((p, i) => (
                            <span key={i} className="text-xs text-gray-500">
                              {labelMedioPago(p.medio_pago)}: {formatPrecio(p.monto)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
