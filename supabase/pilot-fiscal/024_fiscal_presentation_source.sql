-- Fuente histórica mínima para capturar descripciones, sin catálogo mutable.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_contexto_presentacion_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.fiscal_operaciones_homologacion%ROWTYPE; solicitud public.fiscal_solicitudes_homologacion%ROWTYPE; lineas jsonb;
BEGIN
 -- Verifica Auth original/venta y mantiene orden de locks incluso sin hechos.
 PERFORM public.cargar_presentacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id;
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id FOR SHARE;
 IF solicitud.operacion_id IS NULL OR jsonb_typeof(op.venta_snapshot->'detalles') IS DISTINCT FROM 'array'
  OR jsonb_array_length(op.venta_snapshot->'detalles') NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Falta fuente histórica de representación.' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(op.venta_snapshot->'detalles') d WHERE d->>'id' IS NULL OR d->>'cantidad' IS NULL
  OR d->>'precio_unitario' IS NULL OR d->>'subtotal' IS NULL OR (d->>'cantidad')::numeric<=0 OR (d->>'precio_unitario')::numeric<0 OR (d->>'subtotal')::numeric<0) THEN
  RAISE EXCEPTION 'Líneas históricas no representables.' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(jsonb_build_object('detalle_id',d->>'id','cantidad',((d->>'cantidad')::numeric(12,3))::text,
 'precio_unitario',((d->>'precio_unitario')::numeric(12,2))::text,'subtotal',((d->>'subtotal')::numeric(12,2))::text) ORDER BY d->>'id' COLLATE "C") INTO lineas
 FROM jsonb_array_elements(op.venta_snapshot->'detalles') d;
 RETURN jsonb_build_object('venta_id',p_venta_id,'operacion_id',p_operacion_id,'solicitud_sha256',solicitud.solicitud_sha256,'lineas',lineas);
END $$;
REVOKE ALL ON FUNCTION public.cargar_contexto_presentacion_homologacion(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_contexto_presentacion_homologacion(uuid,uuid,uuid) TO service_role;
COMMIT;
