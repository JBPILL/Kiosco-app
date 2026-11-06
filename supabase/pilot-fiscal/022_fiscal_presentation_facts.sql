-- Hechos explícitos para representación gráfica. No habilita emisión ni PDF.
-- Requiere familia 001–021 compatible. Instalación remota con autorización.
BEGIN;
CREATE OR REPLACE FUNCTION public.fiscal_validar_presentacion_homologacion(p_datos jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE grupo text; campo text; limite integer; valor text; linea jsonb; ids text[]; ordenados text[];
BEGIN
 IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR NOT p_datos ?& ARRAY['version','emisor','receptor','lineas','otros_impuestos_nacionales_indirectos']
  OR p_datos-ARRAY['version','emisor','receptor','lineas','otros_impuestos_nacionales_indirectos']<>'{}'::jsonb OR p_datos->'version' IS DISTINCT FROM '1'::jsonb
  OR jsonb_typeof(p_datos->'emisor') IS DISTINCT FROM 'object' OR NOT (p_datos->'emisor') ?& ARRAY['razon_social','domicilio_comercial','ingresos_brutos','inicio_actividades']
  OR (p_datos->'emisor')-ARRAY['razon_social','domicilio_comercial','ingresos_brutos','inicio_actividades']<>'{}'::jsonb
  OR jsonb_typeof(p_datos->'receptor') IS DISTINCT FROM 'object' OR NOT (p_datos->'receptor') ?& ARRAY['nombre','domicilio']
  OR (p_datos->'receptor')-ARRAY['nombre','domicilio']<>'{}'::jsonb THEN
  RAISE EXCEPTION 'Datos de representación inválidos.' USING ERRCODE='22023'; END IF;
 FOR grupo,campo,limite IN SELECT * FROM (VALUES ('emisor','razon_social',160),('emisor','domicilio_comercial',240),('emisor','ingresos_brutos',40),('receptor','nombre',160),('receptor','domicilio',240)) x(g,c,n) LOOP
  valor:=p_datos->grupo->>campo;
  IF jsonb_typeof(p_datos->grupo->campo) IS DISTINCT FROM 'string' OR btrim(valor)='' OR char_length(valor)>limite OR valor ~ '[[:cntrl:]]' THEN
   RAISE EXCEPTION 'Texto de representación inválido.' USING ERRCODE='22023'; END IF;
 END LOOP;
 valor:=p_datos->'emisor'->>'inicio_actividades';
 IF jsonb_typeof(p_datos->'emisor'->'inicio_actividades') IS DISTINCT FROM 'string' OR valor !~ '^[0-9]{8}$'
  OR to_char(to_date(valor,'YYYYMMDD'),'YYYYMMDD') IS DISTINCT FROM valor THEN
  RAISE EXCEPTION 'Fecha de representación inválida.' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_datos->'otros_impuestos_nacionales_indirectos') IS DISTINCT FROM 'string'
  OR (p_datos->>'otros_impuestos_nacionales_indirectos') !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$'
  OR jsonb_typeof(p_datos->'lineas') IS DISTINCT FROM 'array' OR jsonb_array_length(p_datos->'lineas') NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Importe o detalle de representación inválido.' USING ERRCODE='22023'; END IF;
 FOR linea IN SELECT * FROM jsonb_array_elements(p_datos->'lineas') LOOP
  IF jsonb_typeof(linea) IS DISTINCT FROM 'object' OR NOT linea ?& ARRAY['detalle_id','descripcion'] OR linea-ARRAY['detalle_id','descripcion']<>'{}'::jsonb
   OR jsonb_typeof(linea->'detalle_id') IS DISTINCT FROM 'string' OR (linea->>'detalle_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR jsonb_typeof(linea->'descripcion') IS DISTINCT FROM 'string' OR btrim(linea->>'descripcion')='' OR char_length(linea->>'descripcion')>200 OR (linea->>'descripcion') ~ '[[:cntrl:]]' THEN
   RAISE EXCEPTION 'Línea de representación inválida.' USING ERRCODE='22023'; END IF;
 END LOOP;
 SELECT array_agg(v->>'detalle_id' ORDER BY n),array_agg(DISTINCT v->>'detalle_id' COLLATE "C" ORDER BY v->>'detalle_id' COLLATE "C") INTO ids,ordenados FROM jsonb_array_elements(p_datos->'lineas') WITH ORDINALITY x(v,n);
 IF ids IS DISTINCT FROM ordenados THEN RAISE EXCEPTION 'Orden o identidad de líneas inválidos.' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_validar_presentacion_homologacion(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS public.fiscal_presentaciones_homologacion (
 operacion_id uuid PRIMARY KEY REFERENCES public.fiscal_operaciones_homologacion(id),
 actor_auth_id uuid NOT NULL,
 solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
 canonico text NOT NULL CHECK(octet_length(canonico)<=60000),
 datos jsonb NOT NULL CHECK(jsonb_typeof(datos)='object' AND datos=canonico::jsonb),
 presentacion_sha256 text NOT NULL CHECK(presentacion_sha256=encode(sha256(convert_to(canonico,'UTF8')),'hex')),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.fiscal_presentaciones_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_presentaciones_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute WHERE attrelid='public.fiscal_presentaciones_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), SELECT (%s), REFERENCES (%s) ON public.fiscal_presentaciones_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_presentaciones_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_presentaciones_homologacion','SELECT,INSERT,UPDATE') THEN
   RAISE EXCEPTION 'Privilegios heredados en representación fiscal.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_presentacion_inmutable ON public.fiscal_presentaciones_homologacion;
CREATE TRIGGER fiscal_presentacion_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_presentaciones_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();
CREATE OR REPLACE FUNCTION public.cargar_presentacion_fiscal_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE; op public.fiscal_operaciones_homologacion%ROWTYPE; prep public.fiscal_preparaciones_homologacion%ROWTYPE;
 presentacion public.fiscal_presentaciones_homologacion%ROWTYPE; solicitud public.fiscal_solicitudes_homologacion%ROWTYPE;
BEGIN
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id AND venta_id=venta.id AND kiosco_id=venta.kiosco_id AND entorno='HOMOLOGACION' FOR UPDATE;
 IF NOT FOUND OR op.usuario_id IS DISTINCT FROM (SELECT id FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo) THEN
  RAISE EXCEPTION 'Representación fiscal no autorizada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO prep FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=op.id;
 IF NOT FOUND OR prep.actor_auth_id IS DISTINCT FROM p_actor_auth_id THEN RAISE EXCEPTION 'Representación fiscal no autorizada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO presentacion FROM public.fiscal_presentaciones_homologacion WHERE operacion_id=op.id FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=op.id FOR SHARE;
 IF presentacion.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR solicitud.operacion_id IS NULL OR presentacion.solicitud_sha256 IS DISTINCT FROM solicitud.solicitud_sha256
  OR presentacion.datos IS DISTINCT FROM presentacion.canonico::jsonb OR presentacion.presentacion_sha256 IS DISTINCT FROM encode(sha256(convert_to(presentacion.canonico,'UTF8')),'hex') THEN
  RAISE EXCEPTION 'Representación fiscal incoherente.' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('operacion_id',op.id,'venta_id',venta.id,'solicitud_sha256',solicitud.solicitud_sha256,'presentacion_sha256',presentacion.presentacion_sha256,
  'estado','DATOS_REPRESENTACION_GUARDADOS','emision_habilitada',false,'canonico',presentacion.canonico);
END $$;
CREATE OR REPLACE FUNCTION public.guardar_presentacion_fiscal_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid,p_solicitud_sha text,p_canonico text,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE anterior jsonb; datos jsonb; op public.fiscal_operaciones_homologacion%ROWTYPE; solicitud public.fiscal_solicitudes_homologacion%ROWTYPE;
 reserva public.fiscal_reservas_homologacion%ROWTYPE; detalle_ids text[]; propuesta_ids text[];
BEGIN
 anterior:=public.cargar_presentacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
 IF p_solicitud_sha IS NULL OR p_solicitud_sha !~ '^[0-9a-f]{64}$' OR p_sha IS NULL OR p_sha !~ '^[0-9a-f]{64}$'
  OR p_canonico IS NULL OR octet_length(p_canonico)>60000 OR encode(sha256(convert_to(p_canonico,'UTF8')),'hex') IS DISTINCT FROM p_sha THEN
  RAISE EXCEPTION 'Identidad de representación inválida.' USING ERRCODE='22023'; END IF;
 datos:=p_canonico::jsonb;
 PERFORM public.fiscal_validar_presentacion_homologacion(datos);
 IF public.fiscal_json_canonico_homologacion(datos) IS DISTINCT FROM p_canonico THEN RAISE EXCEPTION 'Representación no canónica.' USING ERRCODE='22023'; END IF;
 IF anterior IS NOT NULL THEN
  IF anterior->>'solicitud_sha256' IS DISTINCT FROM p_solicitud_sha OR anterior->>'presentacion_sha256' IS DISTINCT FROM p_sha OR anterior->>'canonico' IS DISTINCT FROM p_canonico THEN
   RAISE EXCEPTION 'Conservar representación original.' USING ERRCODE='55000'; END IF;
  RETURN anterior;
 END IF;
 PERFORM public.autorizar_consulta_fiscal_homologacion(p_actor_auth_id,p_operacion_id);
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id;
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=op.id FOR UPDATE;
 SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=op.id FOR UPDATE;
 IF op.estado IS DISTINCT FROM 'PREPARADA' OR solicitud.operacion_id IS NULL OR solicitud.solicitud_sha256 IS DISTINCT FROM p_solicitud_sha OR solicitud.revision IS DISTINCT FROM 1
  OR reserva.estado IS DISTINCT FROM 'RESERVADA' OR reserva.intento_id IS NOT NULL
  OR EXISTS(SELECT 1 FROM public.fiscal_revisiones_homologacion WHERE operacion_id=op.id)
  OR EXISTS(SELECT 1 FROM public.fiscal_respuestas_emision_homologacion WHERE operacion_id=op.id)
  OR EXISTS(SELECT 1 FROM public.fiscal_reconciliaciones_homologacion WHERE operacion_id=op.id)
  OR EXISTS(SELECT 1 FROM public.fiscal_autorizaciones_homologacion WHERE operacion_id=op.id) THEN
  RAISE EXCEPTION 'Guardar representación antes de revisión e intención.' USING ERRCODE='55000'; END IF;
 SELECT array_agg(x->>'id' COLLATE "C" ORDER BY x->>'id' COLLATE "C") INTO detalle_ids FROM jsonb_array_elements(op.venta_snapshot->'detalles') x;
 SELECT array_agg(x->>'detalle_id' COLLATE "C" ORDER BY x->>'detalle_id' COLLATE "C") INTO propuesta_ids FROM jsonb_array_elements(datos->'lineas') x;
 IF detalle_ids IS DISTINCT FROM propuesta_ids OR to_date(datos->'emisor'->>'inicio_actividades','YYYYMMDD')>to_date(solicitud.cuerpo->>'fecha','YYYYMMDD')
  OR (datos->>'otros_impuestos_nacionales_indirectos')::numeric>(solicitud.cuerpo->'importes'->>'total')::numeric-(solicitud.cuerpo->'importes'->>'iva')::numeric THEN
  RAISE EXCEPTION 'Representación distinta del cuerpo o snapshot.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.fiscal_presentaciones_homologacion(operacion_id,actor_auth_id,solicitud_sha256,canonico,datos,presentacion_sha256)
 VALUES(op.id,p_actor_auth_id,p_solicitud_sha,p_canonico,datos,p_sha);
 anterior:=public.cargar_presentacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
 IF anterior IS NULL OR anterior->>'presentacion_sha256' IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'Representación sin cierre durable.' USING ERRCODE='40001'; END IF;
 RETURN anterior;
END $$;
REVOKE ALL ON FUNCTION public.cargar_presentacion_fiscal_homologacion(uuid,uuid,uuid),public.guardar_presentacion_fiscal_homologacion(uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_presentacion_fiscal_homologacion(uuid,uuid,uuid),public.guardar_presentacion_fiscal_homologacion(uuid,uuid,uuid,text,text,text) TO service_role;
COMMIT;
