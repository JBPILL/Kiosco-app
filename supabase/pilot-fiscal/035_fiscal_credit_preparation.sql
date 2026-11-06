-- Preparación NC durable SIN número/intención/envío. Requiere001–034 compatibles.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_preparaciones_nc_homologacion (
 solicitud_id uuid PRIMARY KEY REFERENCES public.fiscal_nc_borradores_homologacion(id),
 operacion_origen_id uuid NOT NULL REFERENCES public.fiscal_operaciones_homologacion(id), actor_auth_id uuid NOT NULL,
 propuesta_sha256 text NOT NULL CHECK(propuesta_sha256 ~ '^[0-9a-f]{64}$'),
 parametros_revision integer NOT NULL REFERENCES public.fiscal_parametros_nc_homologacion(revision),
 contexto jsonb NOT NULL, datos jsonb NOT NULL, canonico text NOT NULL CHECK(octet_length(canonico)<=131072),
 preparacion_sha256 text NOT NULL CHECK(preparacion_sha256=encode(sha256(convert_to(canonico,'UTF8')),'hex')),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(datos=canonico::jsonb AND datos->'version' IS NOT DISTINCT FROM '1'::jsonb
  AND datos->>'clase' IS NOT DISTINCT FROM 'PREPARACION_NC' AND datos->>'solicitud_id' IS NOT DISTINCT FROM solicitud_id::text
  AND datos->>'operacion_origen_id' IS NOT DISTINCT FROM operacion_origen_id::text AND datos->>'propuesta_sha256' IS NOT DISTINCT FROM propuesta_sha256
  AND contexto->>'propuesta_sha256' IS NOT DISTINCT FROM propuesta_sha256 AND contexto->'revision_parametros' IS NOT DISTINCT FROM to_jsonb(parametros_revision)
  AND datos->>'contexto_sha256' IS NOT DISTINCT FROM encode(sha256(convert_to(public.fiscal_json_canonico_homologacion(contexto),'UTF8')),'hex'))
);
ALTER TABLE public.fiscal_preparaciones_nc_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_preparaciones_nc_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid='public.fiscal_preparaciones_nc_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.fiscal_preparaciones_nc_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_preparaciones_nc_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_preparaciones_nc_homologacion','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Privilegios heredados en preparación NC.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_preparacion_nc_inmutable ON public.fiscal_preparaciones_nc_homologacion;
CREATE TRIGGER fiscal_preparacion_nc_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_preparaciones_nc_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();

CREATE OR REPLACE FUNCTION public.cargar_preparacion_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE caso public.fiscal_nc_borradores_homologacion%ROWTYPE; previa public.fiscal_preparaciones_nc_homologacion%ROWTYPE;
BEGIN
 PERFORM public.cargar_representacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 SELECT * INTO caso FROM public.fiscal_nc_borradores_homologacion WHERE id=p_id FOR SHARE;
 IF NOT FOUND OR caso.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR caso.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id OR caso.propuesta_sha256 IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'Preparación NC no disponible.' USING ERRCODE='42501'; END IF;
 SELECT * INTO previa FROM public.fiscal_preparaciones_nc_homologacion WHERE solicitud_id=p_id FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF previa.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR previa.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id OR previa.propuesta_sha256 IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'Identidad NC distinta.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version',1,'entorno','HOMOLOGACION','venta_id',p_venta_id,'operacion_origen_id',p_operacion_origen_id,'solicitud_id',p_id,'propuesta_sha256',p_sha,
  'estado',CASE WHEN EXISTS(SELECT 1 FROM public.fiscal_nc_cancelaciones_homologacion WHERE solicitud_id=p_id) THEN 'CANCELADA' ELSE 'DATOS_NC_PREPARADOS' END,
  'preparacion',jsonb_build_object('canonico',previa.canonico,'sha256',previa.preparacion_sha256),'contexto',previa.contexto,
  'propuesta',jsonb_build_object('canonico',caso.canonico,'sha256',caso.propuesta_sha256),'emision_habilitada',false,'reintegro_habilitado',false,'reposicion_habilitada',false);
END $$;

CREATE OR REPLACE FUNCTION public.guardar_preparacion_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text,p_contexto_sha text,p_entrada jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previa jsonb; fuente jsonb; contexto jsonb; original jsonb; caso jsonb; cuerpo jsonb; datos jsonb; canonico text;
BEGIN
 PERFORM public.checkout_objeto(p_entrada,ARRAY['servicioDesde','servicioHasta','vencimientoPago']);
 IF p_contexto_sha IS NULL OR p_contexto_sha !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Conservar contexto NC.' USING ERRCODE='22023'; END IF;
 -- Recuperar antes de exigir emisor/catálogo actuales. No reactivar cancelación.
 previa:=public.cargar_preparacion_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF previa IS NOT NULL THEN
  datos:=(previa#>>'{preparacion,canonico}')::jsonb;
  IF datos->>'contexto_sha256' IS DISTINCT FROM p_contexto_sha OR p_entrada IS DISTINCT FROM jsonb_build_object('servicioDesde',datos#>'{datos,servicioDesde}','servicioHasta',datos#>'{datos,servicioHasta}','vencimientoPago',datos#>'{datos,vencimientoPago}') THEN
   RAISE EXCEPTION 'Conservar preparación NC original.' USING ERRCODE='22023'; END IF;
  RETURN previa;
 END IF;
 fuente:=public.cargar_fuente_contexto_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 contexto:=fuente->'contexto';caso:=(fuente#>>'{propuesta,canonico}')::jsonb;
 IF encode(sha256(convert_to(public.fiscal_json_canonico_homologacion(contexto),'UTF8')),'hex') IS DISTINCT FROM p_contexto_sha THEN RAISE EXCEPTION 'Contexto NC cambió.' USING ERRCODE='22023'; END IF;
 original:=public.cargar_representacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 PERFORM public.fiscal_validar_borrador_nc(caso,original);
 cuerpo:=original#>'{constancia,solicitud,solicitud}';
 IF cuerpo->'concepto'='1'::jsonb THEN
  IF p_entrada IS DISTINCT FROM '{"servicioDesde":null,"servicioHasta":null,"vencimientoPago":null}'::jsonb THEN RAISE EXCEPTION 'Períodos NC incompatibles.' USING ERRCODE='22023'; END IF;
 ELSE
  PERFORM public.fiscal_fecha_catalogo_nc(p_entrada->'servicioDesde');PERFORM public.fiscal_fecha_catalogo_nc(p_entrada->'servicioHasta');PERFORM public.fiscal_fecha_catalogo_nc(p_entrada->'vencimientoPago');
  IF p_entrada->>'servicioDesde'>p_entrada->>'servicioHasta' THEN RAISE EXCEPTION 'Período NC invertido.' USING ERRCODE='22023'; END IF;
 END IF;
 datos:=jsonb_build_object('version',1,'clase','PREPARACION_NC','entorno','HOMOLOGACION','venta_id',p_venta_id,'operacion_origen_id',p_operacion_origen_id,'solicitud_id',p_id,'propuesta_sha256',p_sha,'contexto_sha256',p_contexto_sha,
  'fuente_comercial_sha256',contexto->'fuente_comercial_sha256','checkout_sha256',contexto->'checkout_sha256','unidades_sha256',contexto->'unidades_sha256','revision_emisor',contexto->'revision_emisor','revision_parametros',contexto->'revision_parametros',
  'datos',jsonb_build_object('cuitEmisor',contexto->'cuit_emisor','puntoVenta',contexto->'punto_venta','tipoComprobante',contexto->'tipo_nota_credito','concepto',cuerpo->'concepto','tipoDocumento',cuerpo->'tipoDocumento','numeroDocumento',cuerpo->'numeroDocumento',
   'condicionIvaReceptor',caso->'condicion_iva_receptor','fecha',caso->'fecha','servicioDesde',p_entrada->'servicioDesde','servicioHasta',p_entrada->'servicioHasta','vencimientoPago',p_entrada->'vencimientoPago',
   'moneda',cuerpo->'moneda','cotizacion',cuerpo->'cotizacion','importes',caso->'importes','iva',caso->'iva','tributos',caso->'tributos',
   'comprobantesAsociados',jsonb_build_array(jsonb_build_object('tipo',cuerpo->'tipoComprobante','puntoVenta',cuerpo->'puntoVenta','numero',cuerpo->'numero','cuit',cuerpo->'cuitEmisor','fecha',cuerpo->'fecha'))));
 canonico:=public.fiscal_json_canonico_homologacion(datos);
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_parametros_nc_homologacion WHERE revision=(contexto->>'revision_parametros')::integer AND habilitado AND consultado_en<=clock_timestamp() AND vence_en>clock_timestamp()) THEN RAISE EXCEPTION 'Catálogo NC venció.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.fiscal_preparaciones_nc_homologacion(solicitud_id,operacion_origen_id,actor_auth_id,propuesta_sha256,parametros_revision,contexto,datos,canonico,preparacion_sha256)
 VALUES(p_id,p_operacion_origen_id,p_actor_auth_id,p_sha,(contexto->>'revision_parametros')::integer,contexto,datos,canonico,encode(sha256(convert_to(canonico,'UTF8')),'hex'));
 RETURN public.cargar_preparacion_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
END $$;
REVOKE ALL ON FUNCTION public.cargar_preparacion_nc_homologacion(uuid,uuid,uuid,uuid,text),public.guardar_preparacion_nc_homologacion(uuid,uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_preparacion_nc_homologacion(uuid,uuid,uuid,uuid,text),public.guardar_preparacion_nc_homologacion(uuid,uuid,uuid,uuid,text,text,jsonb) TO service_role;
COMMIT;
