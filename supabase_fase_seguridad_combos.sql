-- Aplicar después de supabase_combos.sql y supabase_seguridad_roles_rls.sql.
-- Las políticas restrictivas conservan el aislamiento si se reaplica un SQL antiguo permisivo.
BEGIN;
ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.combo_items FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.combo_items TO authenticated;
GRANT SELECT ON public.combo_items TO service_role;
DROP POLICY IF EXISTS combo_lectura_servidor ON public.combo_items;
CREATE POLICY combo_lectura_servidor ON public.combo_items FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS combo_guard_scope ON public.combo_items;
CREATE POLICY combo_guard_scope ON public.combo_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.auth_es_superadmin() OR kiosco_id=public.auth_user_kiosco_id())
  WITH CHECK (public.auth_es_superadmin() OR kiosco_id=public.auth_user_kiosco_id());
DROP POLICY IF EXISTS combo_guard_anon ON public.combo_items;
CREATE POLICY combo_guard_anon ON public.combo_items AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS combo_base_scope ON public.combo_items;
CREATE POLICY combo_base_scope ON public.combo_items FOR ALL TO authenticated
  USING (public.auth_es_superadmin() OR kiosco_id=public.auth_user_kiosco_id())
  WITH CHECK (public.auth_es_superadmin() OR kiosco_id=public.auth_user_kiosco_id());

DROP POLICY IF EXISTS combo_guard_insert ON public.combo_items;
CREATE POLICY combo_guard_insert ON public.combo_items AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.auth_es_dueno_o_superadmin()
    AND cantidad>0 AND cantidad<>'NaN'::numeric AND cantidad<>'Infinity'::numeric AND cantidad=round(cantidad,3)
    AND combo_producto_id<>componente_producto_id
    AND EXISTS (SELECT 1 FROM public.productos p WHERE p.id=combo_producto_id AND p.kiosco_id=combo_items.kiosco_id)
    AND EXISTS (SELECT 1 FROM public.productos p WHERE p.id=componente_producto_id AND p.kiosco_id=combo_items.kiosco_id));
DROP POLICY IF EXISTS combo_guard_update ON public.combo_items;
CREATE POLICY combo_guard_update ON public.combo_items AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.auth_es_dueno_o_superadmin())
  WITH CHECK (public.auth_es_dueno_o_superadmin()
    AND cantidad>0 AND cantidad<>'NaN'::numeric AND cantidad<>'Infinity'::numeric AND cantidad=round(cantidad,3)
    AND combo_producto_id<>componente_producto_id
    AND EXISTS (SELECT 1 FROM public.productos p WHERE p.id=combo_producto_id AND p.kiosco_id=combo_items.kiosco_id)
    AND EXISTS (SELECT 1 FROM public.productos p WHERE p.id=componente_producto_id AND p.kiosco_id=combo_items.kiosco_id));
DROP POLICY IF EXISTS combo_guard_delete ON public.combo_items;
CREATE POLICY combo_guard_delete ON public.combo_items AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.auth_es_dueno_o_superadmin());

NOTIFY pgrst,'reload schema';
COMMIT;
