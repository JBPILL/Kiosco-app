-- ==============================================================================
-- KIOSKOPOS - MIGRACIÓN MAESTRA UNIFICADA FASE 1: PRODUCCIÓN Y ESCALABILIDAD
-- ==============================================================================
-- Script maestro idempotente para ejecutar en Supabase SQL Editor.
-- Consolida:
-- 1. Tablas y Columnas Modernas (Retornables, Pesables, Combos, Lotes, AFIP, Clientes)
-- 2. Índices de Alto Rendimiento para Escala Multi-Tenant (Millones de registros a < 5ms)
-- 3. Vista de Resumen de Caja en Tiempo Real (v_resumen_caja)
-- 4. Políticas de Seguridad Row Level Security (RLS) para Aislamiento de Comercios
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLAS Y COLUMNAS FUNDAMENTALES
-- ------------------------------------------------------------------------------

-- Kioscos / Comercios
CREATE TABLE IF NOT EXISTS public.kioscos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  direccion TEXT,
  telefono TEXT,
  estado_suscripcion TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado_suscripcion IN ('ACTIVO', 'SOLO_LECTURA', 'SUSPENDIDO')),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  cuit TEXT,
  iibb TEXT,
  inicio_actividades TEXT,
  condicion_iva TEXT,
  afip_punto_venta INTEGER DEFAULT 1,
  afip_habilitado BOOLEAN DEFAULT FALSE
);

-- Asegurar columnas AFIP en kioscos si ya existía la tabla
ALTER TABLE public.kioscos
  ADD COLUMN IF NOT EXISTS cuit TEXT,
  ADD COLUMN IF NOT EXISTS iibb TEXT,
  ADD COLUMN IF NOT EXISTS inicio_actividades TEXT,
  ADD COLUMN IF NOT EXISTS condicion_iva TEXT,
  ADD COLUMN IF NOT EXISTS afip_punto_venta INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS afip_habilitado BOOLEAN DEFAULT FALSE;

-- Usuarios
CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID,
  kiosco_id UUID REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  email TEXT,
  rol TEXT NOT NULL DEFAULT 'CAJERO' CHECK (rol IN ('DUEÑO', 'CAJERO', 'VISOR')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  es_superadmin BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS es_superadmin BOOLEAN DEFAULT FALSE;

-- Categorías
CREATE TABLE IF NOT EXISTS public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  orden INTEGER NOT NULL DEFAULT 0
);

-- Productos con soporte de Retail Avanzado
CREATE TABLE IF NOT EXISTS public.productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  codigo_barras TEXT,
  descripcion TEXT NOT NULL,
  precio_costo NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_venta NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_actual NUMERIC(12,3) NOT NULL DEFAULT 0,
  stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0,
  es_favorito BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  requiere_vencimiento BOOLEAN DEFAULT FALSE,
  dias_alerta_vencimiento INTEGER DEFAULT 15,
  es_pesable BOOLEAN DEFAULT FALSE,
  unidad_medida TEXT DEFAULT 'UN',
  plu_balanza TEXT DEFAULT NULL,
  es_combo BOOLEAN DEFAULT FALSE,
  es_retornable BOOLEAN DEFAULT FALSE,
  precio_envase NUMERIC(12,2) DEFAULT 0,
  nombre_envase TEXT
);

-- Actualizar columnas de productos si ya existía la tabla
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS requiere_vencimiento BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dias_alerta_vencimiento INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS es_pesable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unidad_medida TEXT DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS plu_balanza TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS es_combo BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS es_retornable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS precio_envase NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nombre_envase TEXT;

-- Lotes y Vencimientos (FEFO)
CREATE TABLE IF NOT EXISTS public.lotes_producto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  numero_lote TEXT,
  fecha_vencimiento DATE NOT NULL,
  cantidad_inicial NUMERIC(12,3) NOT NULL,
  cantidad_actual NUMERIC(12,3) NOT NULL,
  fecha_ingreso TIMESTAMPTZ NOT NULL DEFAULT now(),
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

-- Componentes de Combos / Packs
CREATE TABLE IF NOT EXISTS public.items_combo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  combo_producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  componente_producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0)
);

-- Promociones y Ofertas
CREATE TABLE IF NOT EXISTS public.promociones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('NXM', 'VOLUMEN', 'PORCENTAJE', 'COMBO')),
  producto_id UUID REFERENCES public.productos(id) ON DELETE CASCADE,
  cantidad_necesaria INTEGER DEFAULT 1,
  precio_fijo NUMERIC(12,2),
  descuento_porcentaje NUMERIC(5,2),
  lleva_gratis INTEGER DEFAULT 0,
  pagas_por INTEGER DEFAULT 0,
  descuento_segunda_unidad NUMERIC(5,2),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_inicio TIMESTAMPTZ DEFAULT now(),
  fecha_fin TIMESTAMPTZ
);

-- Sesiones de Caja y Arqueo
CREATE TABLE IF NOT EXISTS public.sesiones_caja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id),
  fecha_apertura TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_cierre TIMESTAMPTZ,
  monto_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_final_declarado NUMERIC(12,2),
  monto_final_sistema NUMERIC(12,2),
  diferencia NUMERIC(12,2),
  estado TEXT NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'CERRADA')),
  notas_cierre TEXT
);

-- Movimientos Manuales de Caja (Ingresos y Gastos/Retiros)
CREATE TABLE IF NOT EXISTS public.movimientos_caja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  sesion_caja_id UUID NOT NULL REFERENCES public.sesiones_caja(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO')),
  motivo TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  descripcion TEXT NOT NULL,
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ventas
CREATE TABLE IF NOT EXISTS public.ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  sesion_caja_id UUID REFERENCES public.sesiones_caja(id) ON DELETE SET NULL,
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'COMPLETADA' CHECK (estado IN ('COMPLETADA', 'ANULADA')),
  notas TEXT,
  sincronizado BOOLEAN NOT NULL DEFAULT TRUE,
  afip_cae TEXT,
  afip_tipo_comprobante INTEGER,
  afip_nro_comprobante INTEGER,
  afip_vto_cae TEXT,
  afip_qr_url TEXT
);

-- Detalles de Venta
CREATE TABLE IF NOT EXISTS public.detalles_venta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id),
  cantidad NUMERIC(12,3) NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  sin_envase BOOLEAN DEFAULT FALSE,
  precio_envase_unitario NUMERIC(12,2) DEFAULT 0,
  es_devolucion_envase BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.detalles_venta
  ADD COLUMN IF NOT EXISTS sin_envase BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS precio_envase_unitario NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS es_devolucion_envase BOOLEAN DEFAULT FALSE;

-- Pagos de Venta (Medios de Pago Múltiples)
CREATE TABLE IF NOT EXISTS public.pagos_venta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  medio_pago TEXT NOT NULL CHECK (medio_pago IN ('EFECTIVO', 'MERCADOPAGO', 'TRANSFERENCIA', 'TARJETA', 'CUENTA_CORRIENTE')),
  monto NUMERIC(12,2) NOT NULL,
  referencia TEXT
);

-- Movimientos de Stock (Kardex de Auditoría)
CREATE TABLE IF NOT EXISTS public.movimientos_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO', 'AJUSTE')),
  cantidad NUMERIC(12,3) NOT NULL,
  motivo TEXT NOT NULL,
  notas TEXT,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clientes y Cuenta Corriente (Fiados y Puntos de Fidelidad)
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  telefono TEXT,
  dni_cuit TEXT,
  direccion TEXT,
  email TEXT,
  limite_credito NUMERIC(12,2) DEFAULT 0,
  saldo_deudor NUMERIC(12,2) DEFAULT 0,
  puntos_fidelidad NUMERIC(10,0) DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  notas TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS puntos_fidelidad NUMERIC(10,0) DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.movimientos_cuenta_corriente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  venta_id UUID REFERENCES public.ventas(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('CARGO_VENTA', 'ABONO_PAGO')),
  monto NUMERIC(12,2) NOT NULL DEFAULT 0,
  medio_pago TEXT,
  saldo_resultante NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL
);

-- Proveedores, Compras y Facturas
CREATE TABLE IF NOT EXISTS public.proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  cuit TEXT,
  notas TEXT,
  activo BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compras_proveedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  numero_factura TEXT,
  fecha_compra TIMESTAMPTZ NOT NULL DEFAULT now(),
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado_pago TEXT NOT NULL DEFAULT 'PAGADO' CHECK (estado_pago IN ('PAGADO', 'PENDIENTE', 'PARCIAL')),
  saldo_pendiente NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  fecha_creacion TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.detalles_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id UUID NOT NULL REFERENCES public.compras_proveedor(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  cantidad NUMERIC(12,3) NOT NULL,
  precio_costo_unitario NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pagos_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id UUID NOT NULL REFERENCES public.compras_proveedor(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  monto NUMERIC(12,2) NOT NULL,
  medio_pago TEXT NOT NULL,
  fecha_pago TIMESTAMPTZ NOT NULL DEFAULT now(),
  notas TEXT,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL
);

-- Devoluciones y Reintegros
CREATE TABLE IF NOT EXISTS public.devoluciones_venta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  venta_id UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  usuario_id REFERENCES public.usuarios(id) ON DELETE SET NULL,
  sesion_caja_id UUID REFERENCES public.sesiones_caja(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  monto_total NUMERIC(12,2) NOT NULL CHECK (monto_total >= 0),
  metodo_reintegro TEXT NOT NULL CHECK (metodo_reintegro IN ('EFECTIVO_CAJA', 'CUENTA_CORRIENTE', 'OTRO')),
  motivo TEXT NOT NULL CHECK (motivo IN ('CAMBIO_PRODUCTO', 'FALLA_ROTURA', 'VENCIDO', 'ERROR_COBRO')),
  notas TEXT
);

CREATE TABLE IF NOT EXISTS public.detalles_devolucion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucion_id UUID NOT NULL REFERENCES public.devoluciones_venta(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  reingresa_stock BOOLEAN NOT NULL DEFAULT TRUE
);

-- ------------------------------------------------------------------------------
-- 2. VISTA OPTIMIZADA DE RESUMEN DE CAJA (v_resumen_caja)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_resumen_caja AS
SELECT 
  s.id AS sesion_caja_id,
  s.kiosco_id,
  s.usuario_id,
  u.nombre AS nombre_cajero,
  s.fecha_apertura,
  s.fecha_cierre,
  s.monto_inicial,
  COALESCE(COUNT(DISTINCT v.id), 0) AS total_ventas,
  COALESCE(SUM(v.total), 0) AS total_facturado,
  COALESCE(SUM(CASE WHEN p.medio_pago = 'EFECTIVO' THEN p.monto ELSE 0 END), 0) AS total_efectivo,
  COALESCE(SUM(CASE WHEN p.medio_pago = 'MERCADOPAGO' THEN p.monto ELSE 0 END), 0) AS total_mercadopago,
  COALESCE(SUM(CASE WHEN p.medio_pago = 'TRANSFERENCIA' THEN p.monto ELSE 0 END), 0) AS total_transferencia,
  COALESCE(SUM(CASE WHEN p.medio_pago = 'TARJETA' THEN p.monto ELSE 0 END), 0) AS total_tarjeta,
  COALESCE(SUM(CASE WHEN p.medio_pago = 'CUENTA_CORRIENTE' THEN p.monto ELSE 0 END), 0) AS total_cta_cte
FROM public.sesiones_caja s
LEFT JOIN public.usuarios u ON u.id = s.usuario_id
LEFT JOIN public.ventas v ON v.sesion_caja_id = s.id AND v.estado = 'COMPLETADA'
LEFT JOIN public.pagos_venta p ON p.venta_id = v.id
GROUP BY s.id, s.kiosco_id, s.usuario_id, u.nombre, s.fecha_apertura, s.fecha_cierre, s.monto_inicial;

-- ------------------------------------------------------------------------------
-- 3. ÍNDICES COMPUESTOS DE ALTO RENDIMIENTO (MULTI-TENANT SPEED)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ventas_kiosco_fecha ON public.ventas(kiosco_id, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_sesion_caja ON public.ventas(sesion_caja_id);
CREATE INDEX IF NOT EXISTS idx_detalles_venta_id ON public.detalles_venta(venta_id);
CREATE INDEX IF NOT EXISTS idx_detalles_venta_prod ON public.detalles_venta(producto_id);
CREATE INDEX IF NOT EXISTS idx_pagos_venta_id ON public.pagos_venta(venta_id);

CREATE INDEX IF NOT EXISTS idx_productos_kiosco_cod ON public.productos(kiosco_id, codigo_barras);
CREATE INDEX IF NOT EXISTS idx_productos_kiosco_plu ON public.productos(kiosco_id, plu_balanza);
CREATE INDEX IF NOT EXISTS idx_productos_kiosco_activo ON public.productos(kiosco_id, activo);
CREATE INDEX IF NOT EXISTS idx_productos_kiosco_retornable ON public.productos(kiosco_id, es_retornable);

CREATE INDEX IF NOT EXISTS idx_mov_stock_kiosco_fecha ON public.movimientos_stock(kiosco_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_stock_producto ON public.movimientos_stock(producto_id);

CREATE INDEX IF NOT EXISTS idx_sesiones_caja_kiosco ON public.sesiones_caja(kiosco_id, estado);
CREATE INDEX IF NOT EXISTS idx_mov_caja_sesion ON public.movimientos_caja(sesion_caja_id, fecha_hora DESC);

CREATE INDEX IF NOT EXISTS idx_clientes_kiosco_dni ON public.clientes(kiosco_id, dni_cuit);
CREATE INDEX IF NOT EXISTS idx_mov_cc_cliente_fecha ON public.movimientos_cuenta_corriente(cliente_id, fecha_hora DESC);

CREATE INDEX IF NOT EXISTS idx_lotes_producto_vto ON public.lotes_producto(producto_id, fecha_vencimiento ASC);
CREATE INDEX IF NOT EXISTS idx_items_combo_padre ON public.items_combo(combo_producto_id);

CREATE INDEX IF NOT EXISTS idx_compras_proveedor_kiosco ON public.compras_proveedor(kiosco_id, fecha_compra DESC);
CREATE INDEX IF NOT EXISTS idx_devoluciones_kiosco ON public.devoluciones_venta(kiosco_id, fecha_hora DESC);

-- ------------------------------------------------------------------------------
-- 4. POLÍTICAS ROW LEVEL SECURITY (RLS) - AISLAMIENTO TOTAL ENTRE KIOSCOS
-- ------------------------------------------------------------------------------

-- Función auxiliar para verificar superadmin
CREATE OR REPLACE FUNCTION public.es_superadmin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT es_superadmin FROM public.usuarios WHERE auth_user_id = auth.uid() LIMIT 1),
    FALSE
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Habilitar RLS en todas las tablas principales
ALTER TABLE public.kioscos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_producto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_combo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalles_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_cuenta_corriente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalles_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devoluciones_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalles_devolucion ENABLE ROW LEVEL SECURITY;

-- Políticas universales de aislamiento por kiosco_id
-- (Permite el acceso si el kiosco_id del registro coincide con el del usuario autenticado, o si es superadmin)

DO $$ 
DECLARE
  tbl text;
  tablas text[] := ARRAY[
    'categorias', 'productos', 'lotes_producto', 'items_combo', 
    'promociones', 'sesiones_caja', 'movimientos_caja', 'ventas', 
    'movimientos_stock', 'clientes', 'movimientos_cuenta_corriente', 
    'proveedores', 'compras_proveedor', 'pagos_compra', 'devoluciones_venta'
  ];
BEGIN
  FOREACH tbl IN ARRAY tablas
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Aislamiento por kiosco en %I" ON public.%I', tbl, tbl);
    EXECUTE format('
      CREATE POLICY "Aislamiento por kiosco en %I" ON public.%I
      FOR ALL TO authenticated
      USING (
        public.es_superadmin() = TRUE OR
        kiosco_id IN (SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid())
      )
      WITH CHECK (
        public.es_superadmin() = TRUE OR
        kiosco_id IN (SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid())
      )', tbl, tbl);
  END LOOP;
END $$;

-- Política de detalles_venta (relacionada por venta_id)
DROP POLICY IF EXISTS "Aislamiento detalles_venta" ON public.detalles_venta;
CREATE POLICY "Aislamiento detalles_venta" ON public.detalles_venta
FOR ALL TO authenticated
USING (
  public.es_superadmin() = TRUE OR
  venta_id IN (
    SELECT id FROM public.ventas WHERE kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
)
WITH CHECK (
  public.es_superadmin() = TRUE OR
  venta_id IN (
    SELECT id FROM public.ventas WHERE kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
);

-- Política de pagos_venta (relacionada por venta_id)
DROP POLICY IF EXISTS "Aislamiento pagos_venta" ON public.pagos_venta;
CREATE POLICY "Aislamiento pagos_venta" ON public.pagos_venta
FOR ALL TO authenticated
USING (
  public.es_superadmin() = TRUE OR
  venta_id IN (
    SELECT id FROM public.ventas WHERE kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
)
WITH CHECK (
  public.es_superadmin() = TRUE OR
  venta_id IN (
    SELECT id FROM public.ventas WHERE kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
);

-- Política de detalles_devolucion (relacionada por devolucion_id)
DROP POLICY IF EXISTS "Aislamiento detalles_devolucion" ON public.detalles_devolucion;
CREATE POLICY "Aislamiento detalles_devolucion" ON public.detalles_devolucion
FOR ALL TO authenticated
USING (
  public.es_superadmin() = TRUE OR
  devolucion_id IN (
    SELECT id FROM public.devoluciones_venta WHERE kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
)
WITH CHECK (
  public.es_superadmin() = TRUE OR
  devolucion_id IN (
    SELECT id FROM public.devoluciones_venta WHERE kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
);

-- Política de detalles_compra (relacionada por compra_id)
DROP POLICY IF EXISTS "Aislamiento detalles_compra" ON public.detalles_compra;
CREATE POLICY "Aislamiento detalles_compra" ON public.detalles_compra
FOR ALL TO authenticated
USING (
  public.es_superadmin() = TRUE OR
  compra_id IN (
    SELECT id FROM public.compras_proveedor WHERE kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
)
WITH CHECK (
  public.es_superadmin() = TRUE OR
  compra_id IN (
    SELECT id FROM public.compras_proveedor WHERE kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
);

-- ------------------------------------------------------------------------------
-- FIN DE LA MIGRACIÓN MAESTRA FASE 1
-- ------------------------------------------------------------------------------
