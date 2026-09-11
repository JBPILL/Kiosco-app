// Tipos que representan las tablas de la base de datos

export interface Kiosco {
  id: string
  nombre: string
  direccion: string | null
  telefono: string | null
  estado_suscripcion: 'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO'
  fecha_creacion: string
}

export interface Categoria {
  id: string
  kiosco_id: string
  nombre: string
  color: string
  orden: number
}

export interface Producto {
  id: string
  kiosco_id: string
  categoria_id: string | null
  codigo_barras: string | null
  descripcion: string
  precio_costo: number
  precio_venta: number
  stock_actual: number
  stock_minimo: number
  es_favorito: boolean
  activo: boolean
  fecha_creacion: string
  fecha_actualizacion: string
  // Relación opcional (join)
  categoria?: Categoria
}

export interface Usuario {
  id: string
  auth_user_id: string | null
  kiosco_id: string
  nombre: string
  email: string | null
  rol: 'DUEÑO' | 'CAJERO' | 'VISOR'
  activo: boolean
  fecha_creacion: string
}

export type MedioPago = 'EFECTIVO' | 'MERCADOPAGO' | 'TRANSFERENCIA' | 'TARJETA'

export interface Venta {
  id: string
  kiosco_id: string
  usuario_id: string | null
  sesion_caja_id: string | null
  fecha_hora: string
  total: number
  estado: 'COMPLETADA' | 'ANULADA'
  notas: string | null
  sincronizado: boolean
  // Campos AFIP (futuro)
  afip_cae: string | null
  afip_tipo_comprobante: number | null
  afip_nro_comprobante: number | null
  // Relaciones opcionales (join)
  detalles?: DetalleVenta[]
  pagos?: PagoVenta[]
  usuario?: Usuario
}

export interface DetalleVenta {
  id: string
  venta_id: string
  producto_id: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  // Relación opcional
  producto?: Producto
}

export interface PagoVenta {
  id: string
  venta_id: string
  medio_pago: MedioPago
  monto: number
  referencia: string | null
}

export interface MovimientoStock {
  id: string
  kiosco_id: string
  producto_id: string
  tipo: 'INGRESO' | 'EGRESO' | 'AJUSTE'
  cantidad: number
  motivo: 'COMPRA' | 'VENTA' | 'PERDIDA' | 'VENCIMIENTO' | 'ROTURA' | 'CONTEO' | 'DEVOLUCION'
  notas: string | null
  usuario_id: string | null
  fecha: string
  // Relación opcional
  producto?: Producto
}

export interface SesionCaja {
  id: string
  kiosco_id: string
  usuario_id: string
  fecha_apertura: string
  fecha_cierre: string | null
  monto_inicial: number
  monto_final_declarado: number | null
  monto_final_sistema: number | null
  diferencia: number | null
  estado: 'ABIERTA' | 'CERRADA'
  // Relación opcional
  usuario?: Usuario
}

// --- Tipos para el carrito (solo frontend) ---

export interface ItemCarrito {
  producto: Producto
  cantidad: number
  subtotal: number
}
