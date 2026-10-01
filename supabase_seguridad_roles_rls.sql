-- ==============================================================================
-- FASE 4: SEGURIDAD, POLÍTICAS RLS (ROW LEVEL SECURITY) Y ROLES EN SUPABASE
-- ==============================================================================
-- Este script implementa el aislamiento multi-tenant estricto por comercio (kiosco_id)
-- y la jerarquía de roles (SUPERADMIN, DUEÑO, CAJERO, VISOR).
-- Ejecutar en el SQL Editor del panel de Supabase.
-- ==============================================================================

-- 1. FUNCIONES AUXILIARES DE SESIÓN (SECURITY DEFINER para prevenir recursión RLS)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_user_kiosco_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT kiosco_id FROM public.usuarios
  WHERE auth_user_id = auth.uid() AND activo = true
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
  WHERE auth_user_id = auth.uid() AND activo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_es_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(es_superadmin, false) FROM public.usuarios
  WHERE auth_user_id = auth.uid() AND activo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_es_dueno_o_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(es_superadmin, false) OR (rol = 'DUEÑO') FROM public.usuarios
  WHERE auth_user_id = auth.uid() AND activo = true
  LIMIT 1;
$$;

-- 2. POLÍTICAS RLS: TABLA KIOSCOS
-- ------------------------------------------------------------------------------
ALTER TABLE public.kioscos ENABLE ROW LEVEL SECURITY;

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

-- 3. POLÍTICAS RLS: TABLA USUARIOS
-- ------------------------------------------------------------------------------
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select_policy" ON public.usuarios;
CREATE POLICY "usuarios_select_policy" ON public.usuarios
  FOR SELECT TO authenticated
  USING (
    public.auth_es_superadmin() 
    OR kiosco_id = public.auth_user_kiosco_id()
    OR auth_user_id = auth.uid()
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
    OR auth_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "usuarios_delete_policy" ON public.usuarios;
CREATE POLICY "usuarios_delete_policy" ON public.usuarios
  FOR DELETE TO authenticated
  USING (
    public.auth_es_superadmin() 
    OR (kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin() AND auth_user_id != auth.uid())
  );

-- 4. POLÍTICAS RLS: TABLA CONFIGURACION
-- ------------------------------------------------------------------------------
ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "configuracion_select_policy" ON public.configuracion;
CREATE POLICY "configuracion_select_policy" ON public.configuracion
  FOR SELECT TO authenticated
  USING (
    public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id()
  );

DROP POLICY IF EXISTS "configuracion_mod_policy" ON public.configuracion;
CREATE POLICY "configuracion_mod_policy" ON public.configuracion
  FOR ALL TO authenticated
  USING (
    public.auth_es_superadmin() 
    OR (kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin())
  )
  WITH CHECK (
    public.auth_es_superadmin() 
    OR (kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin())
  );

-- 5. POLÍTICAS RLS: PRODUCTOS Y CATEGORÍAS
-- ------------------------------------------------------------------------------
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

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

-- 6. POLÍTICAS RLS: VENTAS Y DETALLES DE VENTA (AUDITORÍA FISCAL)
-- ------------------------------------------------------------------------------
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalles_venta ENABLE ROW LEVEL SECURITY;

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

-- 7. POLÍTICAS RLS: CAJA Y AUDITORÍA DE MOVIMIENTOS
-- ------------------------------------------------------------------------------
ALTER TABLE public.sesiones_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_caja ENABLE ROW LEVEL SECURITY;

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
    OR (kiosco_id = public.auth_user_kiosco_id() AND (usuario_id = auth.uid() OR public.auth_es_dueno_o_superadmin()))
  );

DROP POLICY IF EXISTS "movimientos_caja_select_policy" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_select_policy" ON public.movimientos_caja
  FOR SELECT TO authenticated
  USING (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

DROP POLICY IF EXISTS "movimientos_caja_insert_policy" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_insert_policy" ON public.movimientos_caja
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_es_superadmin() OR kiosco_id = public.auth_user_kiosco_id());

-- Los movimientos de caja son inmutables por auditoría (no se pueden borrar)
DROP POLICY IF EXISTS "movimientos_caja_no_delete" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_no_delete" ON public.movimientos_caja
  FOR DELETE TO authenticated
  USING (public.auth_es_superadmin());

-- 8. POLÍTICAS RLS: CLIENTES Y PROVEEDORES
-- ------------------------------------------------------------------------------
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

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

-- Fin del script de seguridad y RLS de la Fase 4
