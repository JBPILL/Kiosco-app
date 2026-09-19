-- ==============================================================================
-- MIGRACIÓN SUPABASE: COLUMNA PROVEEDOR_ID EN PRODUCTOS
-- Ejecutar este script en el Editor SQL de tu proyecto Supabase.
-- ==============================================================================

-- 1. Agregar columna proveedor_id con relación a proveedores (opcional)
ALTER TABLE public.productos 
ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL;

-- 2. Crear índice para optimizar filtrado por proveedor en catálogo
CREATE INDEX IF NOT EXISTS idx_productos_proveedor_id ON public.productos(kiosco_id, proveedor_id);
