-- ==============================================================================
-- TABLA DE LOTES Y VENCIMIENTOS (FIFO / FEFO) - KIOSKOPOS
-- Ejecutar en el SQL Editor de Supabase:
-- Permite registrar fechas de vencimiento, lotes y trazabilidad de productos perecederos.
-- ==============================================================================

-- 1. Agregar columnas a tabla productos si no existen
ALTER TABLE public.productos 
  ADD COLUMN IF NOT EXISTS requiere_vencimiento boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dias_alerta_vencimiento integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS es_pesable boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS unidad_medida text DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS plu_balanza text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS es_combo boolean DEFAULT false;

-- 2. Crear tabla de lotes de producto
CREATE TABLE IF NOT EXISTS public.lotes_producto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid REFERENCES public.kioscos(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  numero_lote text DEFAULT NULL,
  fecha_vencimiento date NOT NULL,
  cantidad_inicial numeric NOT NULL DEFAULT 0,
  cantidad_actual numeric NOT NULL DEFAULT 0,
  fecha_ingreso timestamptz DEFAULT now(),
  activo boolean DEFAULT true
);

-- Índices de alto rendimiento para búsqueda y ordenamiento FEFO
CREATE INDEX IF NOT EXISTS idx_lotes_producto_kiosco ON public.lotes_producto(kiosco_id);
CREATE INDEX IF NOT EXISTS idx_lotes_producto_prod ON public.lotes_producto(producto_id);
CREATE INDEX IF NOT EXISTS idx_lotes_producto_vto ON public.lotes_producto(fecha_vencimiento ASC);
CREATE INDEX IF NOT EXISTS idx_lotes_producto_activo ON public.lotes_producto(activo, cantidad_actual);

-- Habilitar RLS
ALTER TABLE public.lotes_producto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados en lotes_producto" ON public.lotes_producto;
CREATE POLICY "Permitir todo a usuarios autenticados en lotes_producto"
  ON public.lotes_producto FOR ALL
  USING (true)
  WITH CHECK (true);

-- Habilitar en publicación en tiempo real si existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'lotes_producto'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lotes_producto;
  END IF;
END $$;
