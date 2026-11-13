-- Captura opcional de unidades para ventas NUEVAS. Sin backfill ni activación.
BEGIN;
CREATE TABLE IF NOT EXISTS public.checkout_unidades_config_homologacion (
 kiosco_id uuid PRIMARY KEY REFERENCES public.kioscos(id), habilitado boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.checkout_unidades_homologacion (
 checkout_id uuid PRIMARY KEY REFERENCES public.checkout_manual_entradas(id),
 kiosco_id uuid NOT NULL REFERENCES public.kioscos(id), actor_auth_id uuid NOT NULL,
 snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
 canonico text NOT NULL CHECK(octet_length(canonico)<=2097152), datos jsonb NOT NULL,
 unidades_sha256 text NOT NULL CHECK(unidades_sha256=encode(sha256(convert_to(canonico,'UTF8')),'hex')),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(datos=canonico::jsonb AND datos->'version'='1'::jsonb AND datos->>'venta_id'=checkout_id::text AND datos->>'checkout_sha256'=snapshot_sha256)
);
DO $$ DECLARE tabla text; columnas text; rol text; BEGIN
 FOREACH tabla IN ARRAY ARRAY['checkout_unidades_config_homologacion','checkout_unidades_homologacion'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tabla);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tabla);
  SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid=('public.'||tabla)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas,tabla);
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Privilegios heredados en unidades.'; END IF;
  END LOOP;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS checkout_unidades_inmutables ON public.checkout_unidades_homologacion;
CREATE TRIGGER checkout_unidades_inmutables BEFORE UPDATE OR DELETE ON public.checkout_unidades_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();

CREATE OR REPLACE FUNCTION public.checkout_datos_unidades_homologacion(p_snapshot jsonb,p_confirmando boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE kid uuid; detalle jsonb; componente jsonb; p public.productos%ROWTYPE; c public.productos%ROWTYPE;
 lista jsonb:='[]'::jsonb; componentes jsonb; tipo text; vistos uuid[]:='{}'; comp_vistos uuid[]; detalle_id uuid; producto_id uuid;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Unidades requieren READ COMMITTED.' USING ERRCODE='25001'; END IF;
 kid:=public.checkout_uuid(p_snapshot->'kiosco_id');
 IF jsonb_typeof(p_snapshot->'detalles') IS DISTINCT FROM 'array' OR jsonb_array_length(p_snapshot->'detalles') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Detalles de unidades inválidos.' USING ERRCODE='22023'; END IF;
 -- El mismo orden global de productos que usa el cierre físico del checkout.
 PERFORM 1 FROM public.productos q WHERE q.kiosco_id=kid AND q.id IN (
  SELECT (d->>'producto_id')::uuid FROM jsonb_array_elements(p_snapshot->'detalles') d
  UNION SELECT (x->>'producto_id')::uuid FROM jsonb_array_elements(p_snapshot->'detalles') d CROSS JOIN LATERAL jsonb_array_elements(d->'componentes') x
 ) ORDER BY q.id FOR SHARE;
 FOR detalle IN SELECT value FROM jsonb_array_elements(p_snapshot->'detalles') ORDER BY (value->>'id')::uuid LOOP
  detalle_id:=public.checkout_uuid(detalle->'id'); producto_id:=public.checkout_uuid(detalle->'producto_id');
  IF detalle_id=ANY(vistos) OR jsonb_typeof(detalle->'componentes') IS DISTINCT FROM 'array' OR jsonb_array_length(detalle->'componentes')>500 THEN RAISE EXCEPTION 'Receta de unidades inválida.' USING ERRCODE='22023'; END IF;
  vistos:=array_append(vistos,detalle_id); componentes:='[]'::jsonb; comp_vistos:='{}';
  IF jsonb_typeof(detalle->'articulo_libre')='object' THEN
   IF jsonb_array_length(detalle->'componentes')<>0 OR public.checkout_numero(detalle->'cantidad',1,999999999,0) IS NULL THEN RAISE EXCEPTION 'Concepto libre fraccionado.' USING ERRCODE='22023'; END IF;
   SELECT * INTO p FROM public.productos q WHERE q.id=producto_id;
   IF (NOT p_confirmando AND FOUND) OR (p_confirmando AND (NOT FOUND OR p.kiosco_id IS DISTINCT FROM kid OR p.es_pesable OR p.es_combo OR p.unidad_medida IS DISTINCT FROM 'UN')) THEN RAISE EXCEPTION 'Concepto libre inconsistente.' USING ERRCODE='22023'; END IF;
   lista:=lista||jsonb_build_array(jsonb_build_object('detalle_id',detalle_id,'producto_id',producto_id,'tipo','LIBRE','es_pesable',false,'unidad_medida','UN','componentes',componentes));
   CONTINUE;
  END IF;
  IF detalle->'articulo_libre' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Clase de artículo no acreditada.' USING ERRCODE='22023'; END IF;
  SELECT * INTO p FROM public.productos q WHERE q.id=producto_id AND q.kiosco_id=kid;
  IF NOT FOUND OR p.unidad_medida NOT IN ('UN','KG','GR','LT') THEN RAISE EXCEPTION 'Unidad del producto no disponible.' USING ERRCODE='22023'; END IF;
  tipo:=CASE WHEN p.es_combo THEN 'COMBO' ELSE 'PRODUCTO' END;
  IF (tipo='COMBO' AND jsonb_array_length(detalle->'componentes')=0) OR (tipo='PRODUCTO' AND jsonb_array_length(detalle->'componentes')<>0) THEN RAISE EXCEPTION 'Tipo/receta cambiaron.' USING ERRCODE='22023'; END IF;
  -- Capturar hechos no debe prohibir una venta que el checkout ya admite.
  -- La elegibilidad de devolución de combos se comprueba por separado.
  PERFORM public.checkout_numero(detalle->'cantidad',0.001,999999,CASE WHEN NOT p.es_pesable THEN 0 ELSE 3 END);
  FOR componente IN SELECT value FROM jsonb_array_elements(CASE WHEN tipo='COMBO' THEN detalle->'componentes' ELSE jsonb_build_array(jsonb_build_object('producto_id',producto_id,'cantidad',1)) END) ORDER BY (value->>'producto_id')::uuid LOOP
   SELECT * INTO c FROM public.productos q WHERE q.id=public.checkout_uuid(componente->'producto_id') AND q.kiosco_id=kid;
   IF NOT FOUND OR c.id=ANY(comp_vistos) OR c.unidad_medida NOT IN ('UN','KG','GR','LT') OR c.es_combo THEN RAISE EXCEPTION 'Unidad del componente no disponible.' USING ERRCODE='22023'; END IF;
   comp_vistos:=array_append(comp_vistos,c.id);
   componentes:=componentes||jsonb_build_array(jsonb_build_object('producto_id',c.id,'es_pesable',c.es_pesable,'unidad_medida',c.unidad_medida));
  END LOOP;
  lista:=lista||jsonb_build_array(jsonb_build_object('detalle_id',detalle_id,'producto_id',producto_id,'tipo',tipo,'es_pesable',p.es_pesable,'unidad_medida',p.unidad_medida,'componentes',componentes));
 END LOOP;
 RETURN jsonb_build_object('version',1,'venta_id',public.checkout_uuid(p_snapshot->'id'),'checkout_sha256',encode(sha256(convert_to(p_snapshot::text,'UTF8')),'hex'),'lineas',lista);
END $$;
REVOKE ALL ON FUNCTION public.checkout_datos_unidades_homologacion(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.checkout_capturar_unidades_homologacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE habilitado boolean; datos jsonb; canonico text;
BEGIN
 SELECT c.habilitado INTO habilitado FROM public.checkout_unidades_config_homologacion c WHERE c.kiosco_id=NEW.kiosco_id FOR SHARE;
 IF NOT coalesce(habilitado,false) THEN RETURN NEW; END IF;
 IF NOT coalesce(auth.role()='service_role',false) OR current_setting('transaction_isolation')<>'read committed'
  OR NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.auth_user_id=NEW.autorizado_por_auth_id AND u.activo AND u.kiosco_id=NEW.kiosco_id AND (u.rol='DUEÑO' OR u.rol='CAJERO' AND u.id=NEW.usuario_id)) THEN RAISE EXCEPTION 'Captura de unidades no autorizada.' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.ventas WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM public.checkout_manuales WHERE id=NEW.id) THEN RAISE EXCEPTION 'No capturar unidades retroactivamente.' USING ERRCODE='55000'; END IF;
 IF public.checkout_uuid(NEW.snapshot->'id') IS DISTINCT FROM NEW.id OR public.checkout_uuid(NEW.snapshot->'kiosco_id') IS DISTINCT FROM NEW.kiosco_id OR public.checkout_uuid(NEW.snapshot->'usuario_id') IS DISTINCT FROM NEW.usuario_id THEN RAISE EXCEPTION 'Identidad de unidades distinta.' USING ERRCODE='22023'; END IF;
 datos:=public.checkout_datos_unidades_homologacion(NEW.snapshot,false); canonico:=public.fiscal_json_canonico_homologacion(datos);
 INSERT INTO public.checkout_unidades_homologacion(checkout_id,kiosco_id,actor_auth_id,snapshot_sha256,canonico,datos,unidades_sha256)
 VALUES(NEW.id,NEW.kiosco_id,NEW.autorizado_por_auth_id,datos->>'checkout_sha256',canonico,datos,encode(sha256(convert_to(canonico,'UTF8')),'hex'));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.checkout_capturar_unidades_homologacion() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS checkout_capturar_unidades_homologacion ON public.checkout_manual_entradas;
CREATE TRIGGER checkout_capturar_unidades_homologacion AFTER INSERT ON public.checkout_manual_entradas FOR EACH ROW EXECUTE FUNCTION public.checkout_capturar_unidades_homologacion();

CREATE OR REPLACE FUNCTION public.checkout_proteger_snapshot_unidades_homologacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.checkout_unidades_homologacion WHERE checkout_id=OLD.id)
  AND (TG_OP='DELETE' OR (NEW.id,NEW.kiosco_id,NEW.usuario_id,NEW.autorizado_por_auth_id,NEW.snapshot) IS DISTINCT FROM (OLD.id,OLD.kiosco_id,OLD.usuario_id,OLD.autorizado_por_auth_id,OLD.snapshot)) THEN RAISE EXCEPTION 'Conservar snapshot de unidades.' USING ERRCODE='55000'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.checkout_proteger_snapshot_unidades_homologacion() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS checkout_proteger_snapshot_unidades_homologacion ON public.checkout_manual_entradas;
CREATE TRIGGER checkout_proteger_snapshot_unidades_homologacion BEFORE UPDATE OR DELETE ON public.checkout_manual_entradas FOR EACH ROW EXECUTE FUNCTION public.checkout_proteger_snapshot_unidades_homologacion();

CREATE OR REPLACE FUNCTION public.checkout_confirmar_unidades_homologacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE registro public.checkout_unidades_homologacion%ROWTYPE; habilitado boolean;
BEGIN
 IF NEW.resultado IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO registro FROM public.checkout_unidades_homologacion WHERE checkout_id=NEW.id FOR SHARE;
 IF NOT FOUND THEN
  SELECT c.habilitado INTO habilitado FROM public.checkout_unidades_config_homologacion c WHERE c.kiosco_id=NEW.kiosco_id;
  IF coalesce(habilitado,false) AND NOT EXISTS(SELECT 1 FROM public.checkout_manual_entradas WHERE id=NEW.id) THEN RAISE EXCEPTION 'Preparar checkout antes de confirmar unidades.' USING ERRCODE='55000'; END IF;
  RETURN NEW; -- Recuperación de preparación anterior sin inventar evidencia.
 END IF;
 IF TG_OP='UPDATE' AND OLD.resultado IS NOT NULL THEN
  IF (NEW.id,NEW.kiosco_id,NEW.venta_id,NEW.solicitud,NEW.resultado) IS DISTINCT FROM (OLD.id,OLD.kiosco_id,OLD.venta_id,OLD.solicitud,OLD.resultado) THEN RAISE EXCEPTION 'Conservar cierre con unidades.' USING ERRCODE='55000'; END IF;
  RETURN NEW;
 END IF;
 IF registro.kiosco_id IS DISTINCT FROM NEW.kiosco_id OR NEW.venta_id IS DISTINCT FROM NEW.id
  OR registro.snapshot_sha256 IS DISTINCT FROM encode(sha256(convert_to(NEW.solicitud::text,'UTF8')),'hex')
  OR registro.datos IS DISTINCT FROM public.checkout_datos_unidades_homologacion(NEW.solicitud,true) THEN RAISE EXCEPTION 'Unidades cambiaron desde la preparación; conservar intento y conciliar.' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.checkout_confirmar_unidades_homologacion() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS checkout_confirmar_unidades_homologacion ON public.checkout_manuales;
CREATE TRIGGER checkout_confirmar_unidades_homologacion BEFORE INSERT OR UPDATE ON public.checkout_manuales FOR EACH ROW EXECUTE FUNCTION public.checkout_confirmar_unidades_homologacion();

CREATE OR REPLACE FUNCTION public.cargar_unidades_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE fuente jsonb; registro public.checkout_unidades_homologacion%ROWTYPE; unidades jsonb;
BEGIN
 fuente:=public.cargar_fuente_comercial_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 SELECT * INTO registro FROM public.checkout_unidades_homologacion WHERE checkout_id=p_venta_id FOR SHARE;
 IF FOUND THEN
  IF registro.snapshot_sha256 IS DISTINCT FROM fuente->>'checkout_sha256' OR registro.datos IS DISTINCT FROM registro.canonico::jsonb OR registro.unidades_sha256 IS DISTINCT FROM encode(sha256(convert_to(registro.canonico,'UTF8')),'hex') THEN RAISE EXCEPTION 'Unidades históricas incoherentes.' USING ERRCODE='22023'; END IF;
  unidades:=jsonb_build_object('canonico',registro.canonico,'sha256',registro.unidades_sha256);
 END IF;
 RETURN jsonb_build_object('version',1,'venta_id',p_venta_id,'operacion_origen_id',p_operacion_origen_id,'solicitud_sha256',fuente->>'solicitud_sha256','checkout_sha256',fuente->>'checkout_sha256',
  'estado',CASE WHEN unidades IS NULL THEN 'NO_REGISTRADAS' ELSE 'CAPTURADAS' END,'unidades',unidades,'emision_habilitada',false,'reintegro_habilitado',false,'reposicion_habilitada',false);
END $$;
REVOKE ALL ON FUNCTION public.cargar_unidades_nc_homologacion(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_unidades_nc_homologacion(uuid,uuid,uuid) TO service_role;
COMMIT;
