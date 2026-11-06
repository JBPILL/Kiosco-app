import { supabase } from './supabase'
import { leerColeccionPorId } from './backupPagination'
import { camposFiscalesReporteVenta } from './salesReportProjection'
import { getLimitesISORango } from './utils'
import type { CompraProveedor, MovimientoCaja, PagoProveedor, Proveedor } from '../types/database'

export interface VentaContable {
  id: string
  fecha_hora: string
  total: number
  estado: string
  notas: string | null
  afip_cae?: string | null
  afip_vto_cae?: string | null
  afip_tipo_comprobante?: number | null
  afip_nro_comprobante?: number | null
  afip_qr_url?: string | null
  usuario?: { nombre: string } | null
  pagos: { medio_pago: string; monto: number }[]
  detalles: { cantidad: number; precio_unitario?: number; subtotal: number; es_devolucion_envase?: boolean; producto?: { descripcion: string } | null }[]
}
export interface DevolucionContable {
  id: string
  venta_id: string
  fecha_hora: string
  monto_total: number
  metodo_reintegro: string | null
  motivo: string | null
  notas: string | null
  venta: VentaContable | null
}
export interface DatosBalance {
  ventas: VentaContable[]
  movimientos: MovimientoCaja[]
  devoluciones: DevolucionContable[]
  proveedores: Proveedor[]
  compras: CompraProveedor[]
  pagos: PagoProveedor[]
}

function importe(valor: unknown, negativo = false): number {
  const n = typeof valor === 'string' && /^-?\d+(\.\d+)?$/.test(valor) ? Number(valor) : valor
  if (typeof n !== 'number' || !Number.isFinite(n) || (!negativo && n < 0) || Math.abs(n) > 9999999999.99 || Number(n.toFixed(2)) !== n) {
    throw new Error('Importe contable incompleto o inválido.')
  }
  return n
}
function fecha(valor: unknown): void {
  if (typeof valor !== 'string' || !Number.isFinite(Date.parse(valor))) throw new Error('Fecha contable incompleta o inválida.')
}
function ventaValidada(v: VentaContable): VentaContable {
  fecha(v.fecha_hora)
  if (!Array.isArray(v.detalles) || !v.detalles.length || !Array.isArray(v.pagos) || !v.pagos.length) throw new Error('Venta sin detalle o pagos verificables.')
  return { ...v, total: importe(v.total), pagos: v.pagos.map(p => ({ ...p, monto: importe(p.monto) })),
    detalles: v.detalles.map(d => {
      const cantidad = Number(d.cantidad), subtotal = importe(d.subtotal, true)
      if (!Number.isFinite(cantidad) || cantidad <= 0 || (subtotal < 0 && d.es_devolucion_envase !== true)) throw new Error('Detalle contable inválido.')
      return { ...d, cantidad, subtotal }
    }) }
}

/** Analysis report: complete reads or failure. No cache or business writes. */
export async function cargarDatosBalance(kioscoId: string, anio: number): Promise<DatosBalance> {
  if (!kioscoId || !Number.isInteger(anio) || anio < 1900 || anio > 9998) throw new Error('Comercio o año de balance inválido.')
  const { inicioISO, finISO } = getLimitesISORango(`${anio}-01-01`, `${anio}-12-31`)
  const ventaSelect = `id,fecha_hora,total,estado,notas,${camposFiscalesReporteVenta()}
    usuario:usuarios!usuario_id(nombre),pagos:pagos_venta(medio_pago,monto),
    detalles:detalles_venta(cantidad,precio_unitario,subtotal,producto_id,sin_envase,es_devolucion_envase,producto:productos(id,descripcion,precio_venta))`
  const [ventas, movimientos, devoluciones, proveedores, compras, pagos] = await Promise.all([
    leerColeccionPorId<VentaContable>(async ultimo => {
      let q = supabase.from('ventas').select(ventaSelect).eq('kiosco_id', kioscoId)
        .gte('fecha_hora', inicioISO).lte('fecha_hora', finISO).order('id').limit(500)
      if (ultimo) q = q.gt('id', ultimo)
      return await q.returns<VentaContable[]>()
    }, 'ventas del balance'),
    leerColeccionPorId<MovimientoCaja>(async ultimo => {
      let q = supabase.from('movimientos_caja').select('*').eq('kiosco_id', kioscoId)
        .gte('fecha_hora', inicioISO).lte('fecha_hora', finISO).order('id').limit(500)
      if (ultimo) q = q.gt('id', ultimo)
      return await q
    }, 'movimientos de caja del balance'),
    leerColeccionPorId<DevolucionContable>(async ultimo => {
      let q = supabase.from('devoluciones_venta').select(`*,venta:ventas(${ventaSelect})`).eq('kiosco_id', kioscoId)
        .gte('fecha_hora', inicioISO).lte('fecha_hora', finISO).order('id').limit(500)
      if (ultimo) q = q.gt('id', ultimo)
      return await q.returns<DevolucionContable[]>()
    }, 'devoluciones del balance'),
    leerColeccionPorId<Proveedor>(async ultimo => {
      let q = supabase.from('proveedores').select('*').eq('kiosco_id', kioscoId).eq('activo', true).order('id').limit(500)
      if (ultimo) q = q.gt('id', ultimo)
      return await q
    }, 'proveedores del balance'),
    leerColeccionPorId<CompraProveedor>(async ultimo => {
      let q = supabase.from('compras_proveedor').select('*,proveedor:proveedores(*)').eq('kiosco_id', kioscoId)
        .gte('fecha', inicioISO).lte('fecha', finISO).order('id').limit(500)
      if (ultimo) q = q.gt('id', ultimo)
      return await q
    }, 'compras del balance'),
    leerColeccionPorId<PagoProveedor>(async ultimo => {
      let q = supabase.from('pagos_proveedor').select('*,proveedor:proveedores(*)').eq('kiosco_id', kioscoId)
        .gte('fecha', inicioISO).lte('fecha', finISO).order('id').limit(500)
      if (ultimo) q = q.gt('id', ultimo)
      return await q
    }, 'pagos a proveedores del balance'),
  ])
  return {
    ventas: ventas.map(ventaValidada),
    movimientos: movimientos.map(m => { fecha(m.fecha_hora); return { ...m, monto: importe(m.monto) } }),
    devoluciones: devoluciones.map(d => { fecha(d.fecha_hora); return { ...d, monto_total: importe(d.monto_total), venta: d.venta ? ventaValidada(d.venta) : null } }),
    proveedores: proveedores.map(p => ({ ...p, saldo_pendiente: importe(p.saldo_pendiente, true) })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    compras: compras.map(c => { fecha(c.fecha); return { ...c, total: importe(c.total) } }),
    pagos: pagos.map(p => { fecha(p.fecha); return { ...p, monto: importe(p.monto) } }),
  }
}
