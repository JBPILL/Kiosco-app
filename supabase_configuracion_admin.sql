-- ==============================================================================
-- TABLA DE CONFIGURACIÓN GLOBAL DEL ADMINISTRADOR / SUPERADMIN
-- Ejecutar este script en el SQL Editor de Supabase si deseas almacenar los
-- datos en una tabla dedicada independiente.
-- (El sistema KioskoPOS ya cuenta con soporte automático mientras tanto).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.configuracion_admin (
  id text PRIMARY KEY DEFAULT 'general',
  whatsapp text DEFAULT '',
  alias_mp text DEFAULT '',
  cbu_banco text DEFAULT '',
  titular_cuenta text DEFAULT '',
  banco_nombre text DEFAULT '',
  mensaje_soporte text DEFAULT 'Hola, me comunico desde KioskoPOS.',
  fecha_actualizacion timestamptz DEFAULT now()
);

-- Habilitar Seguridad por Fila (Row Level Security)
ALTER TABLE public.configuracion_admin ENABLE ROW LEVEL SECURITY;

-- 1. Permitir que cualquier usuario (incluso no autenticado o suspendido) pueda leer los datos de cobro y contacto
DROP POLICY IF EXISTS "Permitir lectura publica de configuracion_admin" ON public.configuracion_admin;
CREATE POLICY "Permitir lectura publica de configuracion_admin"
  ON public.configuracion_admin FOR SELECT
  USING (true);

-- 2. Permitir inserción y actualización a usuarios autenticados
DROP POLICY IF EXISTS "Permitir modificacion a usuarios autenticados" ON public.configuracion_admin;
CREATE POLICY "Permitir modificacion a usuarios autenticados"
  ON public.configuracion_admin FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insertar registro base
INSERT INTO public.configuracion_admin (id, whatsapp, alias_mp, cbu_banco, titular_cuenta, banco_nombre)
VALUES ('general', '', '', '', '', '')
ON CONFLICT (id) DO NOTHING;
