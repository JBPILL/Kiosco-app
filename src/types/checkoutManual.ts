import type { MedioPago } from './database.ts'
import type { TipoAjuste } from '../lib/carritoImportes.ts'
import type { LineaCotizacionPoint } from '../../supabase/functions/_shared/pointQuote.ts'

export interface EntradaCheckoutManual {
  version: 1
  checkoutId: string
  kioscoId: string
  usuarioId: string
  sesionCajaId: string
  fechaHora: string
  clienteId: string | null
  notas: string | null
  tipoAjuste: TipoAjuste
  valorAjuste: number
  totalEsperado: number
  subtotalesEsperados: number[]
  componentesEsperados: Array<{ comboId: string; productoId: string; cantidad: number }>
  lineas: LineaCotizacionPoint[]
  pagos: Array<{ id: string; medio: MedioPago; montoCentavos: number; referencia: string | null }>
}

export interface SnapshotCheckoutManual {
  version: 1
  id: string
  kiosco_id: string
  usuario_id: string
  sesion_caja_id: string
  fecha_hora: string
  total: number
  notas: string | null
  cliente_id: string | null
  detalles: Array<{
    id: string
    producto_id: string
    cantidad: number
    precio_unitario: number
    subtotal: number
    sin_envase: boolean
    precio_envase_unitario: number
    es_devolucion_envase: boolean
    articulo_libre: { descripcion: string; precio_venta: number } | null
    componentes: Array<{ producto_id: string; cantidad: number }>
  }>
  pagos: Array<{ id: string; medio_pago: MedioPago; monto: number; referencia: string | null }>
}

export interface ResultadoCheckoutManual {
  venta_id: string
  kiosco_id: string
  fecha_hora: string
  total: number
  stock: Array<{ producto_id: string; stock_actual: number }>
  saldo_cliente: number | null
}

export interface RegistroCheckoutManual {
  requiereSupervisor: boolean | null
  entrada: EntradaCheckoutManual
  snapshot: SnapshotCheckoutManual
}
