-- ==============================================================================
-- MIGRACIÓN SUPABASE: DEVOLUCIONES DE VENTA Y REINTEGROS (FORMAL SALES RETURNS)
-- ==============================================================================

-- 1. Tabla de Devoluciones de Venta
CREATE TABLE IF NOT EXISTS devoluciones_venta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kiosco_id UUID NOT NULL REFERENCES kioscos(id) ON DELETE CASCADE,
    venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    sesion_caja_id UUID REFERENCES sesiones_caja(id) ON DELETE SET NULL,
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    fecha_hora TIMESTAMPTZ DEFAULT now(),
    monto_total NUMERIC NOT NULL CHECK (monto_total >= 0),
    metodo_reintegro TEXT NOT NULL DEFAULT 'EFECTIVO_CAJA',
    motivo TEXT NOT NULL DEFAULT 'CAMBIO_PRODUCTO',
    notas TEXT
);

-- 2. Tabla de Detalles de Devolución
CREATE TABLE IF NOT EXISTS detalles_devolucion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    devolucion_id UUID NOT NULL REFERENCES devoluciones_venta(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    cantidad NUMERIC NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC NOT NULL CHECK (precio_unitario >= 0),
    subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
    reingresa_stock BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_devoluciones_kiosco ON devoluciones_venta(kiosco_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_venta ON devoluciones_venta(venta_id);
CREATE INDEX IF NOT EXISTS idx_detalles_devolucion_dev ON detalles_devolucion(devolucion_id);
CREATE INDEX IF NOT EXISTS idx_detalles_devolucion_prod ON detalles_devolucion(producto_id);

-- 4. Habilitar RLS
ALTER TABLE devoluciones_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalles_devolucion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devoluciones_venta_all" ON devoluciones_venta;
CREATE POLICY "devoluciones_venta_all" ON devoluciones_venta FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "detalles_devolucion_all" ON detalles_devolucion;
CREATE POLICY "detalles_devolucion_all" ON detalles_devolucion FOR ALL USING (true) WITH CHECK (true);

-- 5. Realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE devoluciones_venta;
    ALTER PUBLICATION supabase_realtime ADD TABLE detalles_devolucion;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
