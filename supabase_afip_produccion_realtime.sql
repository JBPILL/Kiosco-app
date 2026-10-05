-- ==============================================================================
-- KIOSKOPOS / COTTRAQ: MIGRACIÓN DE PRODUCCIÓN PARA AFIP/ARCA Y REALTIME
-- ==============================================================================

-- 1. Tablas y Columnas para AFIP / ARCA en Producción
ALTER TABLE kioscos
  ADD COLUMN IF NOT EXISTS afip_entorno TEXT DEFAULT 'HOMOLOGACION',
  ADD COLUMN IF NOT EXISTS afip_certificado_crt TEXT,
  ADD COLUMN IF NOT EXISTS afip_clave_privada_key TEXT,
  ADD COLUMN IF NOT EXISTS afip_alicuota_iva NUMERIC DEFAULT 21;

ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS afip_estado TEXT DEFAULT 'SIMULADO',
  ADD COLUMN IF NOT EXISTS afip_observaciones TEXT;

-- 2. Tabla de Caché de Tokens de Acceso WSAA (Ticket de Requerimiento de Acceso)
CREATE TABLE IF NOT EXISTS afip_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kiosco_id UUID NOT NULL REFERENCES kioscos(id) ON DELETE CASCADE,
  entorno TEXT NOT NULL CHECK (entorno IN ('HOMOLOGACION', 'PRODUCCION')),
  cuit TEXT NOT NULL,
  token TEXT NOT NULL,
  sign TEXT NOT NULL,
  expiration_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_afip_token_kiosco_entorno UNIQUE (kiosco_id, entorno)
);

-- RLS para afip_tokens:
-- La tabla solo debe ser leída y modificada por la Edge Function con SERVICE_ROLE_KEY.
ALTER TABLE afip_tokens ENABLE ROW LEVEL SECURITY;

-- 3. Habilitar Supabase Realtime para la tabla 'productos'
-- Garantiza que cambios de stock o precios se publiquen a los clientes conectados
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE productos;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
  END;
END $$;

ALTER TABLE productos REPLICA IDENTITY FULL;

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_ventas_afip_estado ON ventas(kiosco_id, afip_estado);
CREATE INDEX IF NOT EXISTS idx_afip_tokens_exp ON afip_tokens(expiration_time);
