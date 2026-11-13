-- Fuente íntegra de representación autorizada. Lectura histórica sin TA/ARCA.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_representacion_fiscal_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE constancia jsonb; hechos jsonb; contexto jsonb; condicion text;
 op public.fiscal_operaciones_homologacion%ROWTYPE; prep public.fiscal_preparaciones_homologacion%ROWTYPE;
 reserva public.fiscal_reservas_homologacion%ROWTYPE; permiso public.fiscal_permisos_emision_homologacion%ROWTYPE;
 revision public.fiscal_revisiones_homologacion%ROWTYPE; vinculo public.fiscal_revisiones_presentacion_homologacion%ROWTYPE;
 importe numeric; ids_hechos text[]; ids_lineas text[];
BEGIN
 constancia:=public.cargar_constancia_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
 hechos:=public.cargar_presentacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
 contexto:=public.cargar_contexto_presentacion_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
 IF hechos IS NULL OR hechos->>'solicitud_sha256' IS DISTINCT FROM constancia#>>'{solicitud,sha256}'
  OR contexto->>'solicitud_sha256' IS DISTINCT FROM constancia#>>'{solicitud,sha256}' THEN
  RAISE EXCEPTION 'Falta representación histórica del cuerpo autorizado.' USING ERRCODE='55000'; END IF;
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id;
 SELECT * INTO prep FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=p_operacion_id FOR SHARE;
 SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id FOR SHARE;
 PERFORM public.fiscal_exigir_intento_respuesta(p_actor_auth_id,p_operacion_id,reserva.intento_id,constancia#>>'{solicitud,sha256}');
 SELECT * INTO permiso FROM public.fiscal_permisos_emision_homologacion WHERE operacion_id=p_operacion_id FOR SHARE;
 SELECT * INTO revision FROM public.fiscal_revisiones_homologacion WHERE id=permiso.revision_aprobada_id FOR SHARE;
 SELECT * INTO vinculo FROM public.fiscal_revisiones_presentacion_homologacion WHERE revision_id=revision.id FOR SHARE;
 IF vinculo.revision_id IS NULL OR vinculo.operacion_id IS DISTINCT FROM p_operacion_id OR vinculo.presentacion_sha256 IS DISTINCT FROM hechos->>'presentacion_sha256'
  OR permiso.usado_en<revision.creado_en OR permiso.usado_en>=revision.vence_en OR permiso.usado_en<permiso.creado_en OR permiso.usado_en>=permiso.vence_en
  OR prep.datos IS DISTINCT FROM prep.canonico::jsonb OR prep.preparacion_sha256 IS DISTINCT FROM encode(sha256(convert_to(prep.canonico,'UTF8')),'hex') THEN
  RAISE EXCEPTION 'Falta revisión de representación consumida coherente.' USING ERRCODE='22023'; END IF;
 SELECT sum((x->>'subtotal')::numeric),array_agg(x->>'detalle_id' ORDER BY x->>'detalle_id' COLLATE "C") INTO importe,ids_lineas FROM jsonb_array_elements(contexto->'lineas') x;
 SELECT array_agg(x->>'detalle_id' ORDER BY x->>'detalle_id' COLLATE "C") INTO ids_hechos FROM jsonb_array_elements((hechos->>'canonico')::jsonb->'lineas') x;
 IF ids_hechos IS DISTINCT FROM ids_lineas OR importe IS DISTINCT FROM (constancia#>>'{solicitud,solicitud,importes,total}')::numeric
  OR (op.venta_snapshot->>'total')::numeric IS DISTINCT FROM importe THEN
  RAISE EXCEPTION 'Importes o líneas históricas distintos del comprobante.' USING ERRCODE='22023'; END IF;
 SELECT c->>'descripcion' INTO condicion FROM public.fiscal_parametros_homologacion p CROSS JOIN LATERAL jsonb_array_elements(p.condiciones) c
 WHERE p.revision=prep.parametros_revision AND c->'id'=constancia#>'{solicitud,solicitud,condicionIvaReceptor}';
 IF condicion IS NULL OR btrim(condicion)='' OR char_length(condicion)>120 OR prep.datos->>'condicionEmisor' IS NULL OR prep.datos->>'condicionEmisor' NOT IN ('MONOTRIBUTO','EXENTO','RESPONSABLE_INSCRIPTO') THEN
  RAISE EXCEPTION 'Falta condición fiscal histórica explícita.' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('version',1,'entorno','HOMOLOGACION','estado','AUTORIZADA','venta_id',p_venta_id,'operacion_id',p_operacion_id,
 'condicion_emisor',prep.datos->>'condicionEmisor','condicion_receptor',condicion,'constancia',constancia,'hechos',hechos,'contexto',contexto);
END $$;
REVOKE ALL ON FUNCTION public.cargar_representacion_fiscal_homologacion(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_representacion_fiscal_homologacion(uuid,uuid,uuid) TO service_role;
COMMIT;
