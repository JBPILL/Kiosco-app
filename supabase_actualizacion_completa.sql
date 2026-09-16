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
  tipo TEXT NOT NULL CHECK (tipo IN ('NXM', 'VOLUMEN', 'PORCENTAJE')),
  producto_id UUID REFERENCES public.productos(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE CASCADE,
  cantidad_minima NUMERIC NOT NULL DEFAULT 1,
  cantidad_paga NUMERIC,
  precio_unitario_promo NUMERIC,
  descuento_porcentaje NUMERIC,
  dias_semana INTEGER[],
  fecha_inicio DATE,
  fecha_fin DATE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
