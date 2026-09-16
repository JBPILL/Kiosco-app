-- ==============================================================================
-- TABLA DE TICKETS DE SOPORTE Y CONSULTAS (SUPERADMIN & USUARIOS)
-- Ejecutar este script en el SQL Editor de Supabase:
-- https://supabase.com/dashboard/project/wlqujnwxrmksheubfrha/sql
-- Permite recibir y gestionar consultas, errores y sugerencias de los kioscos.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tickets_soporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid REFERENCES public.kioscos(id) ON DELETE SET NULL,
  kiosco_nombre text NOT NULL DEFAULT '',
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nombre text NOT NULL DEFAULT '',
  usuario_telefono text DEFAULT '',
  usuario_email text DEFAULT '',
  usuario_rol text DEFAULT 'CAJERO',
  tipo text NOT NULL DEFAULT 'CONSULTA', -- 'ERROR' | 'CONSULTA' | 'SUGERENCIA' | 'FACTURACION' | 'URGENTE'
  modulo text NOT NULL DEFAULT 'General',
  mensaje text NOT NULL,
  datos_diagnostico jsonb DEFAULT '{}'::jsonb,
  estado text NOT NULL DEFAULT 'PENDIENTE', -- 'PENDIENTE' | 'EN_PROCESO' | 'RESUELTO'
  respuesta_admin text DEFAULT '',
  fecha_creacion timestamptz DEFAULT now(),
  fecha_actualizacion timestamptz DEFAULT now()
);

-- Índices para búsquedas y ordenamientos rápidos
CREATE INDEX IF NOT EXISTS idx_tickets_soporte_kiosco ON public.tickets_soporte(kiosco_id);
CREATE INDEX IF NOT EXISTS idx_tickets_soporte_estado ON public.tickets_soporte(estado);
CREATE INDEX IF NOT EXISTS idx_tickets_soporte_fecha ON public.tickets_soporte(fecha_creacion DESC);

-- Habilitar Seguridad por Fila (Row Level Security)
ALTER TABLE public.tickets_soporte ENABLE ROW LEVEL SECURITY;

-- 1. Permitir que cualquier usuario de la aplicación pueda enviar un ticket de soporte
DROP POLICY IF EXISTS "Permitir insercion de tickets" ON public.tickets_soporte;
CREATE POLICY "Permitir insercion de tickets"
  ON public.tickets_soporte FOR INSERT
  WITH CHECK (true);

-- 2. Permitir lectura de tickets
DROP POLICY IF EXISTS "Permitir lectura de tickets" ON public.tickets_soporte;
CREATE POLICY "Permitir lectura de tickets"
  ON public.tickets_soporte FOR SELECT
  USING (true);

-- 3. Permitir actualización de tickets (para cambiar estado o agregar respuesta)
DROP POLICY IF EXISTS "Permitir actualizacion de tickets" ON public.tickets_soporte;
CREATE POLICY "Permitir actualizacion de tickets"
  ON public.tickets_soporte FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 4. Permitir eliminación de tickets
DROP POLICY IF EXISTS "Permitir eliminacion de tickets" ON public.tickets_soporte;
CREATE POLICY "Permitir eliminacion de tickets"
  ON public.tickets_soporte FOR DELETE
  USING (true);
