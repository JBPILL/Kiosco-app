-- Requiere supabase_seguridad_roles_rls.sql y las mejoras de identidad de usuario.
-- Catálogo de precios compartido; no migra ni modifica stock_vacios local.
BEGIN;
CREATE TABLE IF NOT EXISTS public.envases_tipos_comercio (
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(btrim(id)) BETWEEN 1 AND 150),
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 150),
  precio numeric(14,2) NOT NULL CHECK (precio >= 0 AND precio <> 'NaN'::numeric),
  activo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kiosco_id,id)
);
ALTER TABLE public.envases_tipos_comercio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.envases_tipos_comercio FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.envases_tipos_comercio TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.envases_tipos_comercio TO service_role;
DROP POLICY IF EXISTS envases_tipos_lectura ON public.envases_tipos_comercio;
CREATE POLICY envases_tipos_lectura ON public.envases_tipos_comercio
  FOR SELECT TO authenticated USING (
    kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin()
  );
DROP POLICY IF EXISTS envases_tipos_servicio ON public.envases_tipos_comercio;
CREATE POLICY envases_tipos_servicio ON public.envases_tipos_comercio
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.guardar_precios_envases(p_kiosco_id uuid,p_tipos jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_item jsonb;
  v_id text;
  v_nombre text;
  v_precio numeric;
  v_ids text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(
    public.auth_es_superadmin() OR
    (p_kiosco_id=public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin()),false
  ) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  IF p_tipos IS NULL OR jsonb_typeof(p_tipos)<>'array' THEN
    RAISE EXCEPTION 'Lista inválida' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_tipos)>100 THEN RAISE EXCEPTION 'Demasiados tipos de envase'; END IF;
  -- Serializa reemplazos completos del mismo comercio.
  PERFORM 1 FROM public.kioscos WHERE id=p_kiosco_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio inexistente'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_tipos) LOOP
    IF jsonb_typeof(v_item)<>'object' OR jsonb_typeof(v_item->'id')<>'string'
      OR jsonb_typeof(v_item->'nombre')<>'string' OR jsonb_typeof(v_item->'precio')<>'number'
      OR NOT (v_item ?& ARRAY['id','nombre','precio'])
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_item) AS k(key) WHERE key NOT IN ('id','nombre','precio')) THEN
      RAISE EXCEPTION 'Tipo de envase inválido' USING ERRCODE='22023';
    END IF;
    v_id := btrim(v_item->>'id'); v_nombre := btrim(v_item->>'nombre');
    v_precio := (v_item->>'precio')::numeric;
    IF length(v_id) NOT BETWEEN 1 AND 150 OR length(v_nombre) NOT BETWEEN 1 AND 150
      OR v_id=ANY(v_ids) OR v_precio<0 OR v_precio<>round(v_precio,2) THEN
      RAISE EXCEPTION 'Tipo de envase inválido' USING ERRCODE='22023';
    END IF;
    v_ids := array_append(v_ids,v_id);
    INSERT INTO public.envases_tipos_comercio(kiosco_id,id,nombre,precio)
      VALUES(p_kiosco_id,v_id,v_nombre,v_precio)
      ON CONFLICT(kiosco_id,id) DO UPDATE
      SET nombre=EXCLUDED.nombre,precio=EXCLUDED.precio,activo=true,updated_at=now();
  END LOOP;
  UPDATE public.envases_tipos_comercio SET activo=false,updated_at=now()
    WHERE kiosco_id=p_kiosco_id AND NOT (id=ANY(v_ids)) AND activo=true;
  RETURN cardinality(v_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.guardar_precios_envases(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.guardar_precios_envases(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
