-- ==============================================================================
-- MIGRACIÓN DE CORRECCIÓN: RESTRICCIÓN DE MOTIVOS Y CAMPOS EN DEVOLUCIONES
-- ==============================================================================

-- 1. Actualizar el CHECK constraint de motivo en devoluciones_venta para incluir 'OTRO'
ALTER TABLE public.devoluciones_venta DROP CONSTRAINT IF EXISTS devoluciones_venta_motivo_check;
ALTER TABLE public.devoluciones_venta ADD CONSTRAINT devoluciones_venta_motivo_check 
  CHECK (motivo IN ('CAMBIO_PRODUCTO', 'FALLA_ROTURA', 'VENCIDO', 'ERROR_COBRO', 'OTRO'));

-- 2. Asegurar que cliente_id exista en devoluciones_venta
ALTER TABLE public.devoluciones_venta ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_devoluciones_venta_cliente_id ON public.devoluciones_venta (cliente_id);

-- 3. Asegurar que reingresa_stock exista en detalles_devolucion
ALTER TABLE public.detalles_devolucion ADD COLUMN IF NOT EXISTS reingresa_stock BOOLEAN NOT NULL DEFAULT true;
