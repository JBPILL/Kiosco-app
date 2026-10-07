export type RubroComercio = 'KIOSCO' | 'FOTOCOPIADORA_LIBRERIA' | 'GENERAL' | 'PETSHOP_VETERINARIA' | 'ELECTRONICA_CELULARES' | 'DIETETICA' | 'BAZAR'

export interface CapacidadesOperativas {
  envases: boolean
  balanza: boolean
  vencimientos: boolean
  serviciosRapidos: boolean
}

export interface Kiosco {
  id: string
  nombre: string
  direccion: string | null
  telefono: string | null
  estado_suscripcion: 'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO'
  fecha_creacion: string
  rubro?: RubroComercio
  capacidades_operativas?: CapacidadesOperativas | null
  equipos_comercio?: EquiposComercio | null
  // Datos fiscales AFIP
  cuit?: string | null
  iibb?: string | null
  inicio_actividades?: string | null
  condicion_iva?: string | null
  afip_punto_venta?: number | null
  afip_habilitado?: boolean
  // Políticas de Caja
  arqueo_ciego_obligatorio?: boolean
}

export interface EquiposComercio {
  impresoraTipo: string
  impresoraModelo: string
  impresoraConexion: string
  lectorTipo: string
  lectorModelo: string
  lectorConexion: string
  pointModelo: string
  pointTerminalId: string
  observaciones: string
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
  proveedor_id?: string | null
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
  proveedor?: Proveedor
  // Lotes y vencimientos
  requiere_vencimiento?: boolean
  dias_alerta_vencimiento?: number
  // Balanza y pesables
  es_pesable?: boolean
  unidad_medida?: 'UN' | 'KG' | 'GR' | 'LT'
  plu_balanza?: string | null
  // Combos y packs
  es_combo?: boolean
  // Envases retornables
  es_retornable?: boolean
  precio_envase?: number
  nombre_envase?: string
  // Sincronización offline
  _local_offline?: boolean
}

export interface LoteProducto {
  id: string
  kiosco_id: string
  producto_id: string
  numero_lote: string | null
  fecha_vencimiento: string // 'YYYY-MM-DD'
  cantidad_inicial: number
  cantidad_actual: number
  fecha_ingreso: string
  activo: boolean
  // Relación opcional
  producto?: Producto
}

export interface ItemCombo {
  id: string
  kiosco_id: string
  combo_producto_id: string
  componente_producto_id: string
  cantidad: number
  // Relaciones opcionales
  componente?: Producto
  combo?: Producto
}

export interface Usuario {
  id: string
  auth_user_id: string | null
  kiosco_id: string | null
  nombre: string
  email: string | null
  rol: 'DUEÑO' | 'CAJERO' | 'VISOR'
  activo: boolean
  fecha_creacion: string
  es_superadmin?: boolean
}

export type MedioPago = 'EFECTIVO' | 'MERCADOPAGO' | 'TRANSFERENCIA' | 'TARJETA' | 'CUENTA_CORRIENTE'

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
  // Campos AFIP
  afip_cae: string | null
  afip_tipo_comprobante: number | null
  afip_nro_comprobante: number | null
  afip_vto_cae?: string | null
  afip_qr_url?: string | null
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
  motivo: 'COMPRA' | 'VENTA' | 'PERDIDA' | 'VENCIMIENTO' | 'ROTURA' | 'CONTEO' | 'DEVOLUCION' | 'MERMA' | 'ROBO' | 'CONSUMO_INTERNO'
  notas: string | null
  usuario_id: string | null
  fecha: string
  costo_unitario_referencia?: number | null
  lote_producto_id?: string | null
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

export interface ResumenCaja {
  sesion_caja_id: string
  kiosco_id: string
  usuario_id: string
  nombre_cajero?: string
  fecha_apertura: string
  fecha_cierre: string | null
  monto_inicial: number
  total_ventas: number
  total_facturado: number
  total_efectivo: number
  total_mercadopago: number
  total_transferencia: number
  total_tarjeta: number
  total_cuenta_corriente?: number
  total_ingresos_extra?: number
  total_egresos?: number
  efectivo_esperado_en_caja: number
}

export type TipoMovimientoCaja = 'INGRESO' | 'EGRESO'

export type MotivoMovimientoCaja =
  | 'PROVEEDOR'
  | 'GASTO_GENERAL'
  | 'RETIRO_DUENO'
  | 'REPOSICION_CAMBIO'
  | 'DEVOLUCION_VENTA'
  | 'COBRO_CUENTA_CORRIENTE'
  | 'OTRO'

export interface MovimientoCaja {
  id: string
  kiosco_id: string
  sesion_caja_id: string
  usuario_id: string | null
  tipo: TipoMovimientoCaja
  motivo: MotivoMovimientoCaja
  monto: number
  descripcion: string
  fecha_hora: string
  usuario?: Usuario
}

// --- Devoluciones Formales de Ventas ---

export type MetodoReintegro = 'EFECTIVO_CAJA' | 'CUENTA_CORRIENTE' | 'OTRO'
export type MotivoDevolucion = 'CAMBIO_PRODUCTO' | 'FALLA_ROTURA' | 'VENCIDO' | 'ERROR_COBRO' | 'OTRO'

export interface DetalleDevolucion {
  id: string
  devolucion_id: string
  producto_id: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  reingresa_stock: boolean
  producto?: Producto
}

export interface DevolucionVenta {
  id: string
  kiosco_id: string
  venta_id: string
  usuario_id: string | null
  sesion_caja_id: string | null
  cliente_id: string | null
  fecha_hora: string
  monto_total: number
  metodo_reintegro: MetodoReintegro
  motivo: MotivoDevolucion
  notas: string | null
  detalles?: DetalleDevolucion[]
  venta?: Venta
  usuario?: Usuario
  cliente?: Cliente
}

// --- Tipos para el carrito (solo frontend) ---

export interface ItemCarrito {
  producto: Producto
  cantidad: number
  subtotal: number
  descuento_promo?: number
  promo_nombre?: string
  // Envases retornables
  sin_envase?: boolean
  precio_envase_unitario?: number
  es_devolucion_envase?: boolean
  tipo_envase_id?: string
}

// --- Promociones Automáticas (NxM, Volumen, Porcentaje) ---

export type TipoPromocion = 'NXM' | 'VOLUMEN' | 'PORCENTAJE' | 'COMBO'

export interface ItemComboPromo {
  producto_id: string
  cantidad: number
  producto?: Producto
}

export interface Promocion {
  id: string
  kiosco_id: string
  nombre: string
  tipo: TipoPromocion
  producto_id: string | null
  categoria_id: string | null
  cantidad_minima: number
  cantidad_paga: number | null
  precio_unitario_promo: number | null
  descuento_porcentaje: number | null
  precio_combo?: number | null
  items_combo?: ItemComboPromo[] | null
  dias_semana: number[] | null
  fecha_inicio: string | null
  fecha_fin: string | null
  activo: boolean
  created_at?: string
  producto?: Producto | null
  categoria?: Categoria | null
}

// --- Clientes y Cuenta Corriente ("Fiado") ---

export interface Cliente {
  id: string
  kiosco_id: string
  nombre: string
  telefono: string | null
  dni_cuit: string | null
  direccion: string | null
  email: string | null
  limite_credito: number
  saldo_deudor: number
  activo: boolean
  notas: string | null
  fecha_creacion: string
}

export type TipoMovimientoCuentaCorriente = 'CARGO_VENTA' | 'ABONO_PAGO'

export interface MovimientoCuentaCorriente {
  id: string
  cliente_id: string
  kiosco_id: string
  venta_id?: string | null
  tipo: TipoMovimientoCuentaCorriente
  monto: number
  medio_pago?: MedioPago | null
  saldo_resultante: number
  notas: string | null
  fecha_hora: string
  usuario_id: string | null
  usuario?: Usuario
}

// --- Suscripciones y Panel de Super-Admin ---

export interface Plan {
  id: string
  nombre: string
  precio_mensual: number
  max_usuarios: number
  descripcion: string | null
  activo: boolean
}

export interface Suscripcion {
  id: string
  kiosco_id: string
  plan_id: string
  fecha_inicio: string
  fecha_vencimiento: string
  estado: 'ACTIVA' | 'VENCIDA' | 'SUSPENDIDA' | 'CANCELADA'
  plan?: Plan
}

export interface PagoSuscripcion {
  id: string
  suscripcion_id: string
  monto: number
  fecha_pago: string
  medio_pago: string | null
  comprobante: string | null
  notas: string | null
}

export interface KioscoAdminView {
  kiosco_id: string
  nombre_kiosco: string
  direccion: string | null
  telefono_kiosco: string | null
  estado_kiosco: 'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO'
  fecha_creacion: string
  rubro?: RubroComercio
  dueno_usuario_id: string | null
  nombre_dueno: string | null
  email_dueno: string | null
  suscripcion_id: string | null
  fecha_inicio: string | null
  fecha_vencimiento: string | null
  estado_suscripcion: 'ACTIVA' | 'VENCIDA' | 'SUSPENDIDA' | 'CANCELADA' | null
  dias_restantes: number | null
  plan_id: string | null
  nombre_plan: string | null
  precio_mensual: number | null
  fecha_ultimo_pago: string | null
  monto_ultimo_pago: number | null
  medio_ultimo_pago: string | null
}

// --- Proveedores y Recepción de Compras ---

export interface Proveedor {
  id: string
  kiosco_id: string
  nombre: string
  contacto_nombre: string | null
  telefono: string | null
  email: string | null
  cuit: string | null
  dias_visita: string | null
  cbu_alias: string | null
  saldo_pendiente: number
  activo: boolean
  fecha_creacion: string
}

export type EstadoCompra = 'RECIBIDA' | 'ANULADA'
export type MedioPagoCompra = 'EFECTIVO' | 'TRANSFERENCIA' | 'CUENTA_CORRIENTE'

export interface CompraProveedor {
  id: string
  kiosco_id: string
  proveedor_id: string
  usuario_id: string | null
  nro_comprobante: string | null
  fecha: string
  total: number
  estado: EstadoCompra
  medio_pago: MedioPagoCompra
  pagado_en_caja: boolean
  sesion_caja_id: string | null
  notas: string | null
  proveedor?: Proveedor
  detalles?: DetalleCompra[]
  usuario?: Usuario
}

export interface DetalleCompra {
  id: string
  compra_id: string
  producto_id: string
  cantidad: number
  precio_costo_unitario: number
  subtotal: number
  producto?: Producto
}

export interface PagoProveedor {
  id: string
  kiosco_id: string
  proveedor_id: string
  fecha: string
  monto: number
  medio_pago: 'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO'
  saldo_anterior: number
  saldo_nuevo: number
  pagado_en_caja: boolean
  sesion_caja_id: string | null
  comprobante_ref?: string | null
  notas?: string | null
  proveedor?: Proveedor
  estado: 'ACTIVO' | 'ANULADO'
}


