-- ==============================================================================
-- MIGRACIÓN FINAL DE FALTANTES Y CONSOLIDACIÓN - KIOSKOPOS (2026)
-- ==============================================================================
-- Instrucciones:
-- 1. Ve a tu panel de control en Supabase (https://app.supabase.com).
-- 2. Selecciona tu proyecto.
-- 3. Abre la sección "SQL Editor" en el menú lateral izquierdo.
-- 4. Haz clic en "New query" (+).
-- 5. Pega todo este contenido y haz clic en "RUN".
-- ==============================================================================

-- 1. TABLA: movimientos_caja (Ingresos y Egresos manuales durante el turno de caja)
CREATE TABLE IF NOT EXISTS public.movimientos_caja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  sesion_caja_id UUID NOT NULL REFERENCES public.sesiones_caja(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO')),
  motivo TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  descripcion TEXT NOT NULL,
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mov_caja_sesion ON public.movimientos_caja(sesion_caja_id, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_mov_caja_kiosco ON public.movimientos_caja(kiosco_id, fecha_hora DESC);

ALTER TABLE public.movimientos_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso a movimientos_caja por kiosco" ON public.movimientos_caja;
CREATE POLICY "Acceso a movimientos_caja por kiosco" ON public.movimientos_caja
  FOR ALL TO authenticated
  USING (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    kiosco_id IN (
      SELECT kiosco_id FROM public.usuarios WHERE auth_user_id = auth.uid()
    )
  );

GRANT ALL ON public.movimientos_caja TO authenticated, service_role;
GRANT SELECT, INSERT ON public.movimientos_caja TO anon;

-- 2. TABLA: configuracion_admin (Configuraciones generales de superadmin y soporte)
CREATE TABLE IF NOT EXISTS public.configuracion_admin (
  id TEXT PRIMARY KEY DEFAULT 'general',
  whatsapp TEXT,
  alias_mp TEXT,
  cbu_banco TEXT,
  titular_cuenta TEXT,
  banco_nombre TEXT,
  mensaje_soporte TEXT,
  fecha_actualizacion TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.configuracion_admin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica de configuracion_admin" ON public.configuracion_admin;
CREATE POLICY "Permitir lectura publica de configuracion_admin" ON public.configuracion_admin
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Permitir escritura de admin en configuracion_admin" ON public.configuracion_admin;
CREATE POLICY "Permitir escritura de admin en configuracion_admin" ON public.configuracion_admin
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.configuracion_admin TO authenticated, service_role;
GRANT SELECT ON public.configuracion_admin TO anon;

-- 3. REAFIRMAR COLUMNAS DE PRODUCTOS Y RETORNABLES (IDEMPOTENTE)
ALTER TABLE public.productos 
  ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS es_retornable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS precio_envase NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nombre_envase TEXT,
  ADD COLUMN IF NOT EXISTS requiere_vencimiento BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dias_alerta_vencimiento INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS es_pesable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unidad_medida TEXT DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS plu_balanza TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS es_combo BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON public.productos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_productos_retornable ON public.productos(kiosco_id, es_retornable);

-- ==============================================================================
-- FIN DE LA MIGRACIÓN
-- ==============================================================================
