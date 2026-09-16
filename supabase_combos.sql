-- ==============================================================================
-- MIGRACIÓN SUPABASE: COMBOS Y PACKS PROMOCIONALES (PRODUCTOS COMPUESTOS)
-- ==============================================================================

-- 1. Asegurar campo es_combo en productos
ALTER TABLE productos 
ADD COLUMN IF NOT EXISTS es_combo BOOLEAN DEFAULT FALSE;

-- 2. Tabla de recetas e ingredientes / componentes de cada combo
CREATE TABLE IF NOT EXISTS combo_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kiosco_id UUID NOT NULL REFERENCES kioscos(id) ON DELETE CASCADE,
    combo_producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    componente_producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    cantidad NUMERIC NOT NULL CHECK (cantidad > 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (combo_producto_id, componente_producto_id)
);

-- 3. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_combo_items_kiosco ON combo_items(kiosco_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON combo_items(combo_producto_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_comp ON combo_items(componente_producto_id);

-- 4. Habilitar Seguridad a Nivel de Fila (RLS)
ALTER TABLE combo_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "combo_items_select" ON combo_items;
CREATE POLICY "combo_items_select" ON combo_items
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "combo_items_insert" ON combo_items;
CREATE POLICY "combo_items_insert" ON combo_items
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "combo_items_update" ON combo_items;
CREATE POLICY "combo_items_update" ON combo_items
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "combo_items_delete" ON combo_items;
CREATE POLICY "combo_items_delete" ON combo_items
    FOR DELETE USING (true);

-- 5. Publicación en tiempo real (Supabase Realtime)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE combo_items;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
