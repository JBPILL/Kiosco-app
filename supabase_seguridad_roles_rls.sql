-- ==============================================================================
-- FASE 4: SEGURIDAD, POLÍTICAS RLS (ROW LEVEL SECURITY) Y ROLES EN SUPABASE
-- ==============================================================================
-- Este script corrige:
-- 1. ERROR 42P01 (relation "configuracion" does not exist) usando nombres reales y defensivos.
-- 2. Advisor CRITICAL: RLS Disabled in public.afip_config.
-- 3. Advisor CRITICAL: Security Definer View en v_resumen_caja y v_admin_kioscos (security_invoker = true).
-- 4. Advisor WARNING: Auth RLS Initialization Plan en public.usuarios (optimizando con (select auth.uid())).
--
-- Ejecutar este script completo en el SQL Editor de Supabase.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ÍNDICES DE RENDIMIENTO Y OPTIMIZACIÓN RLS (Evita Auth RLS InitPlan warning)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_usuarios_auth_user_id ON public.usuarios(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_kiosco_activo ON public.usuarios(kiosco_id, activo);

-- ------------------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES DE SESIÓN (SECURITY DEFINER optimizadas)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_user_kiosco_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT kiosco_id FROM public.usuarios
  WHERE auth_user_id = (SELECT auth.uid()) AND activo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_rol()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM public.usuarios
  WHERE auth_user_id = (SELECT auth.uid()) AND activo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_es_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT es_superadmin FROM public.usuarios WHERE auth_user_id = (SELECT auth.uid()) AND activo = true LIMIT 1),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_es_dueno_o_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (es_superadmin = true OR rol = 'DUEÑO') FROM public.usuarios WHERE auth_user_id = (SELECT auth.uid()) AND activo = true LIMIT 1),
    false
  );
$$;

-- ------------------------------------------------------------------------------
-- 3. SOLUCIÓN ADVISOR: SECURITY DEFINER VIEWS -> SECURITY INVOKER
-- Garantiza que las vistas respeten las políticas RLS del usuario que consulta
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.v_resumen_caja') IS NOT NULL THEN
    ALTER VIEW public.v_resumen_caja SET (security_invoker = true);
  END IF;

  IF to_regclass('public.v_admin_kioscos') IS NOT NULL THEN
    ALTER VIEW public.v_admin_kioscos SET (security_invoker = true);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. POLÍTICAS RLS: TABLA KIOSCOS
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.kioscos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kioscos_select_policy" ON public.kioscos;
CREATE POLICY "kioscos_select_policy" ON public.kioscos
  FOR SELECT TO authenticated
  USING (
    public.auth_es_superadmin() OR id = public.auth_user_kiosco_id()
  );

DROP POLICY IF EXISTS "kioscos_update_policy" ON public.kioscos;
CREATE POLICY "kioscos_update_policy" ON public.kioscos
  FOR UPDATE TO authenticated
  USING (
    public.auth_es_superadmin() OR (id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin())
  );

-- ------------------------------------------------------------------------------
-- 5. POLÍTICAS RLS: TABLA USUARIOS (Optimizado con (select auth.uid()))
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select_policy" ON public.usuarios;
CREATE POLICY "usuarios_select_policy" ON public.usuarios
  FOR SELECT TO authenticated
  USING (
    public.auth_es_superadmin() 
    OR kiosco_id = public.auth_user_kiosco_id()
    OR auth_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "usuarios_insert_policy" ON public.usuarios;
CREATE POLICY "usuarios_insert_policy" ON public.usuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_es_superadmin() 
    OR (kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin())
  );

DROP POLICY IF EXISTS "usuarios_update_policy" ON public.usuarios;
CREATE POLICY "usuarios_update_policy" ON public.usuarios
  FOR UPDATE TO authenticated
  USING (
    public.auth_es_superadmin() 
    OR (kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin())
    OR auth_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "usuarios_delete_policy" ON public.usuarios;
CREATE POLICY "usuarios_delete_policy" ON public.usuarios
  FOR DELETE TO authenticated
  USING (
    public.auth_es_superadmin() 
    OR (kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin() AND auth_user_id != (SELECT auth.uid()))
  );

-- ------------------------------------------------------------------------------
-- 6. SOLUCIÓN ADVISOR: RLS EN TABLA AFIP_CONFIG Y CONFIGURACION_ADMIN
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.afip_config') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.afip_config ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "afip_config_select_policy" ON public.afip_config';
    EXECUTE 'CREATE POLICY "afip_config_select_policy" ON public.afip_config
      FOR SELECT TO authenticated
      USING (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id())';
    EXECUTE 'DROP POLICY IF EXISTS "afip_config_write_policy" ON public.afip_config';
    EXECUTE 'CREATE POLICY "afip_config_write_policy" ON public.afip_config
      FOR ALL TO authenticated
      USING (public.auth_es_superadmin() OR (kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin()))
      WITH CHECK (public.auth_es_superadmin() OR (kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin()))';
  END IF;

  IF to_regclass('public.configuracion_afip') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.configuracion_afip ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "configuracion_afip_select_policy" ON public.configuracion_afip';
    EXECUTE 'CREATE POLICY "configuracion_afip_select_policy" ON public.configuracion_afip
      FOR SELECT TO authenticated
      USING (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id())';
    EXECUTE 'DROP POLICY IF EXISTS "configuracion_afip_write_policy" ON public.configuracion_afip';
    EXECUTE 'CREATE POLICY "configuracion_afip_write_policy" ON public.configuracion_afip
      FOR ALL TO authenticated
      USING (public.auth_es_superadmin() OR (kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin()))
      WITH CHECK (public.auth_es_superadmin() OR (kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin()))';
  END IF;

  IF to_regclass('public.configuracion_admin') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.configuracion_admin ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "configuracion_admin_read_policy" ON public.configuracion_admin';
    EXECUTE 'CREATE POLICY "configuracion_admin_read_policy" ON public.configuracion_admin
      FOR SELECT TO authenticated
      USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS "configuracion_admin_write_policy" ON public.configuracion_admin';
    EXECUTE 'CREATE POLICY "configuracion_admin_write_policy" ON public.configuracion_admin
      FOR ALL TO authenticated
      USING (public.auth_es_superadmin())
      WITH CHECK (public.auth_es_superadmin())';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. POLÍTICAS RLS: PRODUCTOS Y CATEGORÍAS
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "productos_select_policy" ON public.productos;
CREATE POLICY "productos_select_policy" ON public.productos
  FOR SELECT TO authenticated
  USING (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

DROP POLICY IF EXISTS "productos_write_policy" ON public.productos;
CREATE POLICY "productos_write_policy" ON public.productos
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

DROP POLICY IF EXISTS "productos_update_policy" ON public.productos;
CREATE POLICY "productos_update_policy" ON public.productos
  FOR UPDATE TO authenticated
  USING (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

DROP POLICY IF EXISTS "productos_delete_policy" ON public.productos;
CREATE POLICY "productos_delete_policy" ON public.productos
  FOR DELETE TO authenticated
  USING (public.auth_es_superadmin() OR (kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin()));

DROP POLICY IF EXISTS "categorias_all_policy" ON public.categorias;
CREATE POLICY "categorias_all_policy" ON public.categorias
  FOR ALL TO authenticated
  USING (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id())
  WITH CHECK (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

-- ------------------------------------------------------------------------------
-- 8. POLÍTICAS RLS: VENTAS Y DETALLES (AUDITORÍA FISCAL)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.detalles_venta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ventas_select_policy" ON public.ventas;
CREATE POLICY "ventas_select_policy" ON public.ventas
  FOR SELECT TO authenticated
  USING (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

DROP POLICY IF EXISTS "ventas_insert_policy" ON public.ventas;
CREATE POLICY "ventas_insert_policy" ON public.ventas
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

DROP POLICY IF EXISTS "ventas_update_policy" ON public.ventas;
CREATE POLICY "ventas_update_policy" ON public.ventas
  FOR UPDATE TO authenticated
  USING (
    public.auth_es_superadmin() 
    OR (kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin())
  );

DROP POLICY IF EXISTS "ventas_delete_policy" ON public.ventas;
CREATE POLICY "ventas_delete_policy" ON public.ventas
  FOR DELETE TO authenticated
  USING (public.auth_es_superadmin());

DROP POLICY IF EXISTS "detalles_venta_policy" ON public.detalles_venta;
CREATE POLICY "detalles_venta_policy" ON public.detalles_venta
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ventas v
      WHERE v.id = detalles_venta.venta_id
      AND (public.auth_es_superadmin() OR v.kiosco_id = public.auth_user_kiosco_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ventas v
      WHERE v.id = detalles_venta.venta_id
      AND (public.auth_es_superadmin() OR v.kiosco_id = public.auth_user_kiosco_id())
    )
  );

-- ------------------------------------------------------------------------------
-- 9. POLÍTICAS RLS: CAJA Y AUDITORÍA DE MOVIMIENTOS
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.sesiones_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.movimientos_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sesiones_caja_select_policy" ON public.sesiones_caja;
CREATE POLICY "sesiones_caja_select_policy" ON public.sesiones_caja
  FOR SELECT TO authenticated
  USING (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

DROP POLICY IF EXISTS "sesiones_caja_insert_policy" ON public.sesiones_caja;
CREATE POLICY "sesiones_caja_insert_policy" ON public.sesiones_caja
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

DROP POLICY IF EXISTS "sesiones_caja_update_policy" ON public.sesiones_caja;
CREATE POLICY "sesiones_caja_update_policy" ON public.sesiones_caja
  FOR UPDATE TO authenticated
  USING (
    public.auth_es_superadmin() 
    OR (kiosco_id = public.auth_user_kiosco_id() AND (usuario_id = (SELECT auth.uid()) OR public.auth_es_dueno_o_superadmin()))
  );

DROP POLICY IF EXISTS "movimientos_caja_select_policy" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_select_policy" ON public.movimientos_caja
  FOR SELECT TO authenticated
  USING (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

DROP POLICY IF EXISTS "movimientos_caja_insert_policy" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_insert_policy" ON public.movimientos_caja
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

-- Inmutabilidad de auditoría de caja: no se permite eliminar movimientos
DROP POLICY IF EXISTS "movimientos_caja_no_delete" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_no_delete" ON public.movimientos_caja
  FOR DELETE TO authenticated
  USING (public.auth_es_superadmin());

-- ------------------------------------------------------------------------------
-- 10. POLÍTICAS RLS: CLIENTES Y PROVEEDORES
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.proveedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_all_policy" ON public.clientes;
CREATE POLICY "clientes_all_policy" ON public.clientes
  FOR ALL TO authenticated
  USING (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id())
  WITH CHECK (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

DROP POLICY IF EXISTS "proveedores_all_policy" ON public.proveedores;
CREATE POLICY "proveedores_all_policy" ON public.proveedores
  FOR ALL TO authenticated
  USING (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id())
  WITH CHECK (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

-- Fin del script oficial de seguridad y RLS de la Fase 4
