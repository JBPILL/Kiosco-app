-- ==============================================================================
-- MIGRACIÓN: PROMOCIONES AUTOMÁTICAS (NxM, 2x1, 3x2, VOLUMEN, PORCENTAJE)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.promociones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('NXM', 'VOLUMEN', 'PORCENTAJE', 'COMBO')),
    producto_id UUID REFERENCES public.productos(id) ON DELETE CASCADE,
    categoria_id UUID REFERENCES public.categorias(id) ON DELETE CASCADE,
    cantidad_minima NUMERIC NOT NULL DEFAULT 1,
    cantidad_paga NUMERIC,
    precio_unitario_promo NUMERIC,
    descuento_porcentaje NUMERIC,
    precio_combo NUMERIC,
    items_combo JSONB,
    dias_semana INTEGER[], -- [0, 1, 2, 3, 4, 5, 6] (0 = Domingo, 1 = Lunes, etc.)
    fecha_inicio DATE,
    fecha_fin DATE,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migraciones seguras para bases ya existentes
DO $$ 
BEGIN
    ALTER TABLE public.promociones DROP CONSTRAINT IF EXISTS promociones_tipo_check;
    ALTER TABLE public.promociones ADD CONSTRAINT promociones_tipo_check CHECK (tipo IN ('NXM', 'VOLUMEN', 'PORCENTAJE', 'COMBO'));
    ALTER TABLE public.promociones ADD COLUMN IF NOT EXISTS precio_combo NUMERIC;
    ALTER TABLE public.promociones ADD COLUMN IF NOT EXISTS items_combo JSONB;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_promociones_kiosco ON public.promociones(kiosco_id);
CREATE INDEX IF NOT EXISTS idx_promociones_producto ON public.promociones(producto_id);
CREATE INDEX IF NOT EXISTS idx_promociones_categoria ON public.promociones(categoria_id);
CREATE INDEX IF NOT EXISTS idx_promociones_activo ON public.promociones(activo);

-- Habilitar RLS
ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad para kioscos
DROP POLICY IF EXISTS "Usuarios pueden ver promociones de su kiosco" ON public.promociones;
CREATE POLICY "Usuarios pueden ver promociones de su kiosco" ON public.promociones
    FOR SELECT
    USING (
        kiosco_id IN (
            SELECT kiosco_id FROM public.usuarios WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Dueños pueden insertar promociones en su kiosco" ON public.promociones;
CREATE POLICY "Dueños pueden insertar promociones en su kiosco" ON public.promociones
    FOR INSERT
    WITH CHECK (
        kiosco_id IN (
            SELECT kiosco_id FROM public.usuarios WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Dueños pueden actualizar promociones en su kiosco" ON public.promociones;
CREATE POLICY "Dueños pueden actualizar promociones en su kiosco" ON public.promociones
    FOR UPDATE
    USING (
        kiosco_id IN (
            SELECT kiosco_id FROM public.usuarios WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Dueños pueden eliminar promociones en su kiosco" ON public.promociones;
CREATE POLICY "Dueños pueden eliminar promociones en su kiosco" ON public.promociones
    FOR DELETE
    USING (
        kiosco_id IN (
            SELECT kiosco_id FROM public.usuarios WHERE id = auth.uid()
        )
    );
