-- ==============================================================================
-- MIGRACIÓN UNIFICADA DE ACTUALIZACIÓN COMPLETA - KIOSKOPOS
-- Ejecutar este script en el SQL Editor de tu proyecto Supabase.
-- Incorpora: Vencimientos y Lotes, Balanza y Pesables, Combos/Packs, Devoluciones y Promociones.
-- ==============================================================================

-- 1. ACTUALIZAR TABLA PRODUCTOS CON COLUMNAS DE RETAIL AVANZADO
ALTER TABLE public.productos 
  ADD COLUMN IF NOT EXISTS requiere_vencimiento BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dias_alerta_vencimiento INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS es_pesable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unidad_medida TEXT DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS plu_balanza TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS es_combo BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_productos_plu_balanza ON public.productos(kiosco_id, plu_balanza);

-- ------------------------------------------------------------------------------
-- 1b. TABLA DE CLIENTES Y PROGRAMA DE PUNTOS DE FIDELIZACIÓN (ODOO ERP)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  telefono TEXT,
  dni_cuit TEXT,
  direccion TEXT,
  email TEXT,
  limite_credito NUMERIC DEFAULT 0,
  saldo_deudor NUMERIC DEFAULT 0,
  puntos_fidelidad NUMERIC DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  notas TEXT,
  fecha_creacion TIMESTAMPTZ DEFAULT now()
);

-- Si la tabla ya existía previamente, asegurar la columna de puntos:
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS puntos_fidelidad NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_clientes_kiosco ON public.clientes(kiosco_id);
CREATE INDEX IF NOT EXISTS idx_clientes_dni ON public.clientes(dni_cuit);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso a clientes por kiosco" ON public.clientes;
CREATE POLICY "Acceso a clientes por kiosco" ON public.clientes
  FOR ALL TO authenticated
  USING (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- 1c. TABLA DE MOVIMIENTOS DE CUENTA CORRIENTE (FIADO Y ABONOS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.movimientos_cuenta_corriente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  venta_id UUID REFERENCES public.ventas(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('CARGO_VENTA', 'ABONO_PAGO')),
  monto NUMERIC NOT NULL DEFAULT 0,
  medio_pago TEXT,
  saldo_resultante NUMERIC NOT NULL DEFAULT 0,
  notas TEXT,
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mov_cc_cliente ON public.movimientos_cuenta_corriente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mov_cc_kiosco ON public.movimientos_cuenta_corriente(kiosco_id);

ALTER TABLE public.movimientos_cuenta_corriente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso a movimientos CC por kiosco" ON public.movimientos_cuenta_corriente;
CREATE POLICY "Acceso a movimientos CC por kiosco" ON public.movimientos_cuenta_corriente
  FOR ALL TO authenticated
  USING (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- 1d. TABLAS DE PROVEEDORES, COMPRAS Y PAGOS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  contacto_nombre TEXT,
  telefono TEXT,
  email TEXT,
  cuit TEXT,
  dias_visita TEXT,
  cbu_alias TEXT,
  saldo_pendiente NUMERIC DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proveedores_kiosco ON public.proveedores(kiosco_id);

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso a proveedores por kiosco" ON public.proveedores;
CREATE POLICY "Acceso a proveedores por kiosco" ON public.proveedores
  FOR ALL TO authenticated
  USING (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.compras_proveedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  nro_comprobante TEXT,
  fecha TIMESTAMPTZ DEFAULT now(),
  total NUMERIC NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'RECIBIDA',
  medio_pago TEXT NOT NULL DEFAULT 'EFECTIVO',
  pagado_en_caja BOOLEAN DEFAULT false,
  sesion_caja_id UUID REFERENCES public.sesiones_caja(id) ON DELETE SET NULL,
  notas TEXT,
  fecha_creacion TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compras_proveedor_kiosco ON public.compras_proveedor(kiosco_id);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor_prov ON public.compras_proveedor(proveedor_id);

ALTER TABLE public.compras_proveedor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso a compras_proveedor por kiosco" ON public.compras_proveedor;
CREATE POLICY "Acceso a compras_proveedor por kiosco" ON public.compras_proveedor
  FOR ALL TO authenticated
  USING (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.detalles_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id UUID NOT NULL REFERENCES public.compras_proveedor(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  cantidad NUMERIC NOT NULL DEFAULT 1,
  precio_costo_unitario NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_detalles_compra_compra ON public.detalles_compra(compra_id);

ALTER TABLE public.detalles_compra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso a detalles_compra por kiosco" ON public.detalles_compra;
CREATE POLICY "Acceso a detalles_compra por kiosco" ON public.detalles_compra
  FOR ALL TO authenticated
  USING (
    compra_id IN (
      SELECT id FROM public.compras_proveedor WHERE kiosco_id IN (
        SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    compra_id IN (
      SELECT id FROM public.compras_proveedor WHERE kiosco_id IN (
        SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE TABLE IF NOT EXISTS public.pagos_proveedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  fecha TIMESTAMPTZ DEFAULT now(),
  monto NUMERIC NOT NULL DEFAULT 0,
  medio_pago TEXT NOT NULL DEFAULT 'EFECTIVO',
  saldo_anterior NUMERIC DEFAULT 0,
  saldo_nuevo NUMERIC DEFAULT 0,
  pagado_en_caja BOOLEAN DEFAULT false,
  sesion_caja_id UUID REFERENCES public.sesiones_caja(id) ON DELETE SET NULL,
  comprobante_ref TEXT,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'ACTIVO'
);

CREATE INDEX IF NOT EXISTS idx_pagos_proveedor_kiosco ON public.pagos_proveedor(kiosco_id);
CREATE INDEX IF NOT EXISTS idx_pagos_proveedor_prov ON public.pagos_proveedor(proveedor_id);

ALTER TABLE public.pagos_proveedor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso a pagos_proveedor por kiosco" ON public.pagos_proveedor;
CREATE POLICY "Acceso a pagos_proveedor por kiosco" ON public.pagos_proveedor
  FOR ALL TO authenticated
  USING (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  );

-- 2. TABLA DE LOTES Y VENCIMIENTOS (FIFO / FEFO)
CREATE TABLE IF NOT EXISTS public.lotes_producto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID REFERENCES public.kioscos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  numero_lote TEXT DEFAULT NULL,
  fecha_vencimiento DATE NOT NULL,
  cantidad_inicial NUMERIC NOT NULL DEFAULT 0,
  cantidad_actual NUMERIC NOT NULL DEFAULT 0,
  fecha_ingreso TIMESTAMPTZ DEFAULT now(),
  activo BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_lotes_producto_kiosco ON public.lotes_producto(kiosco_id);
CREATE INDEX IF NOT EXISTS idx_lotes_producto_prod ON public.lotes_producto(producto_id);
CREATE INDEX IF NOT EXISTS idx_lotes_producto_vto ON public.lotes_producto(fecha_vencimiento ASC);
CREATE INDEX IF NOT EXISTS idx_lotes_producto_activo ON public.lotes_producto(activo, cantidad_actual);

ALTER TABLE public.lotes_producto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados en lotes_producto" ON public.lotes_producto;
CREATE POLICY "Permitir todo a usuarios autenticados en lotes_producto"
  ON public.lotes_producto FOR ALL
  TO authenticated
  USING (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  );

-- 3. TABLA DE COMBOS Y PACKS (PRODUCTOS COMPUESTOS)
CREATE TABLE IF NOT EXISTS public.combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID REFERENCES public.kioscos(id) ON DELETE CASCADE,
  combo_producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  componente_producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  cantidad NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON public.combo_items(combo_producto_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_componente ON public.combo_items(componente_producto_id);

ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir acceso a combo_items a miembros del kiosco" ON public.combo_items;
CREATE POLICY "Permitir acceso a combo_items a miembros del kiosco"
  ON public.combo_items FOR ALL
  TO authenticated
  USING (
    combo_producto_id IN (
      SELECT id FROM public.productos WHERE kiosco_id IN (
        SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    combo_producto_id IN (
      SELECT id FROM public.productos WHERE kiosco_id IN (
        SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
      )
    )
  );

-- 4. TABLAS DE DEVOLUCIONES DE VENTA Y DETALLES
CREATE TABLE IF NOT EXISTS public.devoluciones_venta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  venta_id UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  sesion_caja_id UUID REFERENCES public.sesiones_caja(id) ON DELETE SET NULL,
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  monto_total NUMERIC NOT NULL DEFAULT 0,
  metodo_reintegro TEXT NOT NULL CHECK (metodo_reintegro IN ('EFECTIVO_CAJA', 'CUENTA_CORRIENTE', 'OTRO')),
  motivo TEXT NOT NULL CHECK (motivo IN ('CAMBIO_PRODUCTO', 'FALLA_ROTURA', 'VENCIDO', 'ERROR_COBRO')),
  reingresa_stock BOOLEAN NOT NULL DEFAULT true,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_venta_kiosco ON public.devoluciones_venta(kiosco_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_venta_venta ON public.devoluciones_venta(venta_id);

CREATE TABLE IF NOT EXISTS public.detalles_devolucion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucion_id UUID NOT NULL REFERENCES public.devoluciones_venta(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  cantidad NUMERIC NOT NULL,
  precio_unitario NUMERIC NOT NULL,
  subtotal NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_detalles_devolucion_dev ON public.detalles_devolucion(devolucion_id);

ALTER TABLE public.devoluciones_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalles_devolucion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios pueden ver devoluciones de su kiosco" ON public.devoluciones_venta;
CREATE POLICY "Usuarios pueden ver devoluciones de su kiosco" ON public.devoluciones_venta
  FOR ALL TO authenticated
  USING (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Usuarios pueden gestionar detalles de devolucion" ON public.detalles_devolucion;
CREATE POLICY "Usuarios pueden gestionar detalles de devolucion" ON public.detalles_devolucion
  FOR ALL TO authenticated
  USING (
    devolucion_id IN (
      SELECT id FROM public.devoluciones_venta WHERE kiosco_id IN (
        SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
      )
    )
  );

-- 5. TABLA DE PROMOCIONES AUTOMÁTICAS
CREATE TABLE IF NOT EXISTS public.promociones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('NXM', 'VOLUMEN', 'PORCENTAJE', 'COMBO')),
  producto_id UUID REFERENCES public.productos(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE CASCADE,
  cantidad_minima NUMERIC NOT NULL DEFAULT 1,
  cantidad_paga NUMERIC,
  precio_unitario_promo NUMERIC,
  descuento_porcentaje NUMERIC,
  precio_combo NUMERIC,
  items_combo JSONB,
  dias_semana INTEGER[],
  fecha_inicio DATE,
  fecha_fin DATE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Actualización retrocompatible para tablas existentes
DO $$ 
BEGIN
  ALTER TABLE public.promociones DROP CONSTRAINT IF EXISTS promociones_tipo_check;
  ALTER TABLE public.promociones ADD CONSTRAINT promociones_tipo_check CHECK (tipo IN ('NXM', 'VOLUMEN', 'PORCENTAJE', 'COMBO'));
  ALTER TABLE public.promociones ADD COLUMN IF NOT EXISTS precio_combo NUMERIC;
  ALTER TABLE public.promociones ADD COLUMN IF NOT EXISTS items_combo JSONB;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_promociones_kiosco ON public.promociones(kiosco_id);
CREATE INDEX IF NOT EXISTS idx_promociones_producto ON public.promociones(producto_id);
CREATE INDEX IF NOT EXISTS idx_promociones_categoria ON public.promociones(categoria_id);
CREATE INDEX IF NOT EXISTS idx_promociones_activo ON public.promociones(activo);

ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso a promociones por kiosco" ON public.promociones;
CREATE POLICY "Acceso a promociones por kiosco" ON public.promociones
  FOR ALL TO authenticated
  USING (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  );
