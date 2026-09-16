-- ==============================================================================
-- MIGRACIÓN SUPABASE: PRODUCTOS PESABLES Y BALANZAS COMERCIALES (EAN-13 PREFIJO 20)
-- ==============================================================================

-- 1. Agregar columnas para control de peso y balanza comercial
ALTER TABLE productos 
ADD COLUMN IF NOT EXISTS es_pesable BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS unidad_medida TEXT DEFAULT 'UN',
ADD COLUMN IF NOT EXISTS plu_balanza TEXT;

-- 2. Índice para acelerar la búsqueda de PLU en balanzas comerciales (Systel, Kretz, Toledo)
CREATE INDEX IF NOT EXISTS idx_productos_plu_balanza ON productos(kiosco_id, plu_balanza);
