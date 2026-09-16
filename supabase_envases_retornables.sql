-- ==============================================================================
-- MIGRACIÓN SUPABASE: PRODUCTOS CON ENVASES RETORNABLES
-- ==============================================================================

-- 1. Agregar columnas para control de envases retornables en productos
ALTER TABLE productos 
ADD COLUMN IF NOT EXISTS es_retornable BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS precio_envase NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS nombre_envase TEXT;

-- 2. Agregar soporte para envases en detalles de venta
ALTER TABLE detalles_venta
ADD COLUMN IF NOT EXISTS sin_envase BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS precio_envase_unitario NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS es_devolucion_envase BOOLEAN DEFAULT FALSE;

-- 3. Índice para acelerar la consulta de productos retornables
CREATE INDEX IF NOT EXISTS idx_productos_es_retornable ON productos(kiosco_id, es_retornable);
