-- Desistimiento durable antes de crear caso. Sin envío ni efectos comerciales.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_nc_desistimientos_homologacion (
 solicitud_id uuid PRIMARY KEY, operacion_origen_id uuid NOT NULL REFERENCES public.fiscal_operaciones_homologacion(id),
 actor_auth_id uuid NOT NULL, propuesta_sha256 text NOT NULL CHECK(propuesta_sha256 ~ '^[0-9a-f]{64}$'),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.fiscal_nc_desistimientos_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_nc_desistimientos_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid='public.fiscal_nc_desistimientos_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.fiscal_nc_desistimientos_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_nc_desistimientos_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_nc_desistimientos_homologacion','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Privilegios heredados en desistimientos NC.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_nc_desistimiento_inmutable ON public.fiscal_nc_desistimientos_homologacion;
CREATE TRIGGER fiscal_nc_desistimiento_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_nc_desistimientos_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();
CREATE OR REPLACE FUNCTION public.fiscal_nc_excluir_desistimiento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE caso_id uuid:=(to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='fiscal_nc_borradores_homologacion' THEN 'id' ELSE 'solicitud_id' END)::uuid;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Exclusión NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:nc:'||caso_id::text,0));
 IF TG_TABLE_NAME='fiscal_nc_borradores_homologacion' THEN
  IF EXISTS(SELECT 1 FROM public.fiscal_nc_desistimientos_homologacion d WHERE d.solicitud_id=caso_id) THEN RAISE EXCEPTION 'Conservar desistimiento NC; no crear caso tardío.' USING ERRCODE='55000'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.fiscal_nc_borradores_homologacion b WHERE b.id=caso_id) THEN RAISE EXCEPTION 'Caso NC existente requiere cancelación de su borrador.' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_nc_excluir_desistimiento() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_nc_excluir_desistimiento ON public.fiscal_nc_borradores_homologacion;
CREATE TRIGGER fiscal_nc_excluir_desistimiento BEFORE INSERT ON public.fiscal_nc_borradores_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_nc_excluir_desistimiento();
DROP TRIGGER IF EXISTS fiscal_nc_excluir_caso ON public.fiscal_nc_desistimientos_homologacion;
CREATE TRIGGER fiscal_nc_excluir_caso BEFORE INSERT ON public.fiscal_nc_desistimientos_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_nc_excluir_desistimiento();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.fiscal_nc_borradores_homologacion b JOIN public.fiscal_nc_desistimientos_homologacion d ON d.solicitud_id=b.id) THEN RAISE EXCEPTION 'Historia NC incompatible: caso y desistimiento simultáneos.' USING ERRCODE='55000'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fiscal_nc_desistimiento_ack(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('version',1,'entorno','HOMOLOGACION','solicitud_id',d.solicitud_id,'venta_id',o.venta_id,'operacion_origen_id',d.operacion_origen_id,
 'propuesta_sha256',d.propuesta_sha256,'estado','CANCELADA','emision_habilitada',false,'reintegro_habilitado',false,'reposicion_habilitada',false)
 FROM public.fiscal_nc_desistimientos_homologacion d JOIN public.fiscal_operaciones_homologacion o ON o.id=d.operacion_origen_id WHERE d.solicitud_id=p_id
$$;
REVOKE ALL ON FUNCTION public.fiscal_nc_desistimiento_ack(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.cargar_borrador_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE caso public.fiscal_nc_borradores_homologacion%ROWTYPE; desistimiento public.fiscal_nc_desistimientos_homologacion%ROWTYPE;
BEGIN
 PERFORM public.cargar_representacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 SELECT * INTO caso FROM public.fiscal_nc_borradores_homologacion WHERE id=p_id FOR SHARE;
 IF FOUND THEN
  IF caso.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR caso.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id THEN RAISE EXCEPTION 'Consulta NC no autorizada.' USING ERRCODE='42501'; END IF;
  RETURN public.fiscal_nc_ack(p_id);
 END IF;
 SELECT * INTO desistimiento FROM public.fiscal_nc_desistimientos_homologacion WHERE solicitud_id=p_id FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF desistimiento.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR desistimiento.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id THEN RAISE EXCEPTION 'Consulta NC no autorizada.' USING ERRCODE='42501'; END IF;
 RETURN public.fiscal_nc_desistimiento_ack(p_id);
END $$;
CREATE OR REPLACE FUNCTION public.cancelar_borrador_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE caso public.fiscal_nc_borradores_homologacion%ROWTYPE; desistimiento public.fiscal_nc_desistimientos_homologacion%ROWTYPE;
BEGIN
 PERFORM public.cargar_representacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 IF p_id IS NULL OR p_sha IS NULL OR p_sha !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Identidad NC inválida.' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:nc:'||p_id::text,0));
 SELECT * INTO caso FROM public.fiscal_nc_borradores_homologacion WHERE id=p_id FOR SHARE;
 IF NOT FOUND THEN
  SELECT * INTO desistimiento FROM public.fiscal_nc_desistimientos_homologacion WHERE solicitud_id=p_id FOR SHARE;
  IF FOUND THEN
   IF desistimiento.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR desistimiento.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id OR desistimiento.propuesta_sha256 IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'Desistimiento NC distinto.' USING ERRCODE='42501'; END IF;
  ELSE
   INSERT INTO public.fiscal_nc_desistimientos_homologacion(solicitud_id,operacion_origen_id,actor_auth_id,propuesta_sha256) VALUES(p_id,p_operacion_origen_id,p_actor_auth_id,p_sha);
  END IF;
  RETURN public.fiscal_nc_desistimiento_ack(p_id);
 END IF;
 IF caso.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR caso.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id OR caso.propuesta_sha256 IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'Cancelación NC no autorizada.' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.fiscal_nc_cancelaciones_homologacion WHERE solicitud_id=p_id) THEN RETURN public.fiscal_nc_ack(p_id); END IF;
 IF EXISTS(SELECT 1 FROM public.fiscal_nc_borradores_homologacion b WHERE b.operacion_origen_id=p_operacion_origen_id AND b.secuencia>caso.secuencia
  AND NOT EXISTS(SELECT 1 FROM public.fiscal_nc_cancelaciones_homologacion c WHERE c.solicitud_id=b.id)) THEN RAISE EXCEPTION 'Cancelar primero borradores NC posteriores.' USING ERRCODE='55000'; END IF;
 INSERT INTO public.fiscal_nc_cancelaciones_homologacion(solicitud_id,actor_auth_id,propuesta_sha256) VALUES(p_id,p_actor_auth_id,p_sha);
 RETURN public.fiscal_nc_ack(p_id);
END $$;
REVOKE ALL ON FUNCTION public.cargar_borrador_nc_homologacion(uuid,uuid,uuid,uuid),public.cancelar_borrador_nc_homologacion(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_borrador_nc_homologacion(uuid,uuid,uuid,uuid),public.cancelar_borrador_nc_homologacion(uuid,uuid,uuid,uuid,text) TO service_role;
COMMIT;
