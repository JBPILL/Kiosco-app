-- Aplicar después del snapshot de combos y las políticas de usuarios.
BEGIN;
CREATE OR REPLACE FUNCTION public.restaurar_combo_backup(
  p_kiosco_id uuid, p_producto_id uuid, p_es_combo boolean, p_componentes jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE perfil public.usuarios%ROWTYPE; cantidad_items integer;
BEGIN
  BEGIN
    SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR UPDATE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Se requiere un único dueño activo.' USING ERRCODE='42501';
  END;
  IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.kiosco_id IS DISTINCT FROM p_kiosco_id THEN
    RAISE EXCEPTION 'Solo el dueño del mismo comercio puede restaurar combos.' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.kioscos WHERE id=p_kiosco_id AND estado_suscripcion='ACTIVO' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio no habilitado.' USING ERRCODE='42501'; END IF;
  IF p_es_combo IS NULL OR jsonb_typeof(p_componentes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Componentes inválidos.' USING ERRCODE='22023';
  END IF;
  cantidad_items := jsonb_array_length(p_componentes);
  IF cantidad_items>500 OR (p_es_combo AND cantidad_items=0) OR (NOT p_es_combo AND cantidad_items<>0) THEN
    RAISE EXCEPTION 'Cantidad de componentes incompatible.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_componentes) e WHERE
    jsonb_typeof(e) IS DISTINCT FROM 'object' OR jsonb_typeof(e->'componente_producto_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(e->'cantidad') IS DISTINCT FROM 'number') THEN
    RAISE EXCEPTION 'Componente inválido.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_componentes) e WHERE
    (e->>'cantidad')::numeric<0.001 OR (e->>'cantidad')::numeric>999999
    OR (e->>'cantidad')::numeric<>round((e->>'cantidad')::numeric,3)
    OR (e->>'componente_producto_id')::uuid=p_producto_id)
  OR (SELECT count(DISTINCT (e->>'componente_producto_id')::uuid) FROM jsonb_array_elements(p_componentes) e)<>cantidad_items THEN
    RAISE EXCEPTION 'Cantidades o referencias inválidas.' USING ERRCODE='22023';
  END IF;
  -- Bloqueo estable de todos los productos antes de sustituir componentes.
  PERFORM 1 FROM public.productos WHERE kiosco_id=p_kiosco_id AND
    (id=p_producto_id OR id IN (SELECT (e->>'componente_producto_id')::uuid FROM jsonb_array_elements(p_componentes) e))
    ORDER BY id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id=p_producto_id AND kiosco_id=p_kiosco_id)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_componentes) e WHERE NOT EXISTS(
    SELECT 1 FROM public.productos p WHERE p.id=(e->>'componente_producto_id')::uuid
      AND p.kiosco_id=p_kiosco_id AND NOT COALESCE(p.es_combo,false))) THEN
    RAISE EXCEPTION 'Producto ausente, ajeno o componente virtual.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_componentes) e JOIN public.productos p
    ON p.id=(e->>'componente_producto_id')::uuid AND p.kiosco_id=p_kiosco_id
    WHERE NOT COALESCE(p.es_pesable,false) AND (e->>'cantidad')::numeric<>trunc((e->>'cantidad')::numeric)) THEN
    RAISE EXCEPTION 'Un componente por unidad no permite fracciones.' USING ERRCODE='22023';
  END IF;
  -- Activar un producto referenciado tampoco puede crear anidamientos inconsistentes.
  IF p_es_combo AND EXISTS(SELECT 1 FROM public.combo_items WHERE componente_producto_id=p_producto_id) THEN
    RAISE EXCEPTION 'El producto está usado como componente de otro combo.' USING ERRCODE='22023';
  END IF;
  DELETE FROM public.combo_items WHERE combo_producto_id=p_producto_id AND kiosco_id=p_kiosco_id;
  INSERT INTO public.combo_items(id,kiosco_id,combo_producto_id,componente_producto_id,cantidad)
  SELECT gen_random_uuid(),p_kiosco_id,p_producto_id,(e->>'componente_producto_id')::uuid,(e->>'cantidad')::numeric
  FROM jsonb_array_elements(p_componentes) e;
  IF (SELECT count(*) FROM public.combo_items WHERE combo_producto_id=p_producto_id AND kiosco_id=p_kiosco_id)<>cantidad_items
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_componentes) e WHERE NOT EXISTS(
    SELECT 1 FROM public.combo_items ci WHERE ci.combo_producto_id=p_producto_id AND ci.kiosco_id=p_kiosco_id
      AND ci.componente_producto_id=(e->>'componente_producto_id')::uuid AND ci.cantidad=(e->>'cantidad')::numeric)) THEN
    RAISE EXCEPTION 'El servidor no conservó la composición exacta.' USING ERRCODE='22023';
  END IF;
  UPDATE public.productos SET es_combo=p_es_combo WHERE id=p_producto_id AND kiosco_id=p_kiosco_id;
  IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id=p_producto_id AND kiosco_id=p_kiosco_id AND es_combo=p_es_combo) THEN
    RAISE EXCEPTION 'El servidor no confirmó el tipo del producto.' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('producto_id',p_producto_id,'es_combo',p_es_combo,'componentes',cantidad_items);
END;
$$;
REVOKE ALL ON FUNCTION public.restaurar_combo_backup(uuid,uuid,boolean,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.restaurar_combo_backup(uuid,uuid,boolean,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
