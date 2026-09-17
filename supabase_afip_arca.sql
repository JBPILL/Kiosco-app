-- ==============================================================================
-- KIOSKOPOS: MIGRACIÓN PARA FACTURACIÓN ELECTRÓNICA AFIP / ARCA (WSFEv1)
-- Ejecutar este script en Supabase > SQL Editor > Run
-- ==============================================================================

-- 1. Asegurar columnas fiscales en la tabla 'kioscos'
ALTER TABLE kioscos
  ADD COLUMN IF NOT EXISTS cuit TEXT,
  ADD COLUMN IF NOT EXISTS iibb TEXT,
  ADD COLUMN IF NOT EXISTS inicio_actividades TEXT,
  ADD COLUMN IF NOT EXISTS condicion_iva TEXT DEFAULT 'MONOTRIBUTO',
  ADD COLUMN IF NOT EXISTS afip_punto_venta INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS afip_habilitado BOOLEAN DEFAULT FALSE;

-- 2. Asegurar columnas fiscales en la tabla 'ventas'
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS afip_cae TEXT,
  ADD COLUMN IF NOT EXISTS afip_tipo_comprobante INTEGER,
  ADD COLUMN IF NOT EXISTS afip_nro_comprobante INTEGER,
  ADD COLUMN IF NOT EXISTS afip_vto_cae TEXT,
  ADD COLUMN IF NOT EXISTS afip_qr_url TEXT;

-- 3. Índices de rendimiento para consultas del Libro IVA y reportes fiscales
CREATE INDEX IF NOT EXISTS idx_ventas_afip_cae ON ventas(kiosco_id, afip_cae) WHERE afip_cae IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ventas_afip_nro ON ventas(kiosco_id, afip_nro_comprobante) WHERE afip_nro_comprobante IS NOT NULL;
