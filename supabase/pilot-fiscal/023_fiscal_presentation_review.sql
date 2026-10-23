-- Vincula revisión humana con los hechos históricos exactos. Sin activación.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_revisiones_presentacion_homologacion(
 revision_id uuid PRIMARY KEY REFERENCES public.fiscal_revisiones_homologacion(id),
 operacion_id uuid NOT NULL REFERENCES public.fiscal_presentaciones_homologacion(operacion_id),
 presentacion_sha256 text NOT NULL CHECK(presentacion_sha256 ~ '^[0-9a-f]{64}$')
);
ALTER TABLE public.fiscal_revisiones_presentacion_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_revisiones_presentacion_homologacion FROM PUBLIC,anon,authenticated,service_role;
REVOKE SELECT(revision_id,operacion_id,presentacion_sha256),INSERT(revision_id,operacion_id,presentacion_sha256),UPDATE(revision_id,operacion_id,presentacion_sha256),REFERENCES(revision_id,operacion_id,presentacion_sha256) ON public.fiscal_revisiones_presentacion_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE rol text; BEGIN
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_revisiones_presentacion_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_revisiones_presentacion_homologacion','SELECT,INSERT,UPDATE') THEN
   RAISE EXCEPTION 'Privilegios heredados en revisión de representación.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_revision_presentacion_inmutable ON public.fiscal_revisiones_presentacion_homologacion;
CREATE TRIGGER fiscal_revision_presentacion_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_revisiones_presentacion_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();
-- Conservar implementación anterior como helper privado, sin ampliar grants.
DO $$ BEGIN
 IF to_regprocedure('public.fiscal_aprobar_revision_sin_presentacion(uuid,uuid,uuid,text,integer)') IS NULL THEN
  ALTER FUNCTION public.aprobar_revision_fiscal_homologacion(uuid,uuid,uuid,text,integer) RENAME TO fiscal_aprobar_revision_sin_presentacion;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_aprobar_revision_sin_presentacion(uuid,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.aprobar_revision_fiscal_homologacion(p_operacion_id uuid,p_actor_auth_id uuid,p_id uuid,p_sha text,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 PERFORM public.cargar_revision_fiscal_homologacion(p_operacion_id,p_actor_auth_id);
 IF EXISTS(SELECT 1 FROM public.fiscal_presentaciones_homologacion WHERE operacion_id=p_operacion_id) THEN
  RAISE EXCEPTION 'Confirmar también la representación exacta.' USING ERRCODE='42501'; END IF;
 RETURN public.fiscal_aprobar_revision_sin_presentacion(p_operacion_id,p_actor_auth_id,p_id,p_sha,p_revision);
END $$;
CREATE OR REPLACE FUNCTION public.cargar_revision_presentacion_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid,p_revision_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE datos jsonb; contexto jsonb; revision public.fiscal_revisiones_homologacion%ROWTYPE; vinculo public.fiscal_revisiones_presentacion_homologacion%ROWTYPE;
BEGIN
 datos:=public.cargar_presentacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
 contexto:=public.cargar_revision_fiscal_homologacion(p_operacion_id,p_actor_auth_id);
 IF datos IS NULL THEN RAISE EXCEPTION 'Faltan hechos de representación.' USING ERRCODE='55000'; END IF;
 SELECT * INTO vinculo FROM public.fiscal_revisiones_presentacion_homologacion WHERE revision_id=p_revision_id FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO revision FROM public.fiscal_revisiones_homologacion WHERE id=p_revision_id FOR SHARE;
 IF vinculo.operacion_id IS DISTINCT FROM p_operacion_id OR vinculo.presentacion_sha256 IS DISTINCT FROM datos->>'presentacion_sha256'
  OR revision.operacion_id IS DISTINCT FROM p_operacion_id OR revision.actor_auth_id IS DISTINCT FROM p_actor_auth_id
  OR revision.solicitud_sha256 IS DISTINCT FROM datos->>'solicitud_sha256' THEN
  RAISE EXCEPTION 'Revisión de representación incoherente.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',revision.id,'operacion_id',revision.operacion_id,'solicitud_sha256',revision.solicitud_sha256,'revision',revision.solicitud_revision,
 'aprobada',true,'vence_en',revision.vence_en,'emision_habilitada',false,'presentacion_sha256',vinculo.presentacion_sha256);
END $$;
CREATE OR REPLACE FUNCTION public.aprobar_revision_presentacion_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid,p_revision_id uuid,p_solicitud_sha text,p_revision integer,p_presentacion_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE datos jsonb; ack jsonb; anterior jsonb;
BEGIN
 datos:=public.cargar_presentacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
 IF datos IS NULL OR p_presentacion_sha IS NULL OR datos->>'presentacion_sha256' IS DISTINCT FROM p_presentacion_sha
  OR datos->>'solicitud_sha256' IS DISTINCT FROM p_solicitud_sha THEN RAISE EXCEPTION 'Cambió la representación a revisar.' USING ERRCODE='40001'; END IF;
 anterior:=public.cargar_revision_presentacion_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id,p_revision_id);
 IF anterior IS NOT NULL THEN
  IF anterior->>'solicitud_sha256' IS DISTINCT FROM p_solicitud_sha OR (anterior->>'revision')::integer IS DISTINCT FROM p_revision THEN
   RAISE EXCEPTION 'Identidad de revisión ya utilizada.' USING ERRCODE='42501'; END IF;
  RETURN anterior;
 END IF;
 -- No convertir una aprobación antigua en confirmación de hechos nuevos.
 IF EXISTS(SELECT 1 FROM public.fiscal_revisiones_homologacion WHERE id=p_revision_id) THEN
  RAISE EXCEPTION 'La revisión anterior no confirmó estos hechos.' USING ERRCODE='42501'; END IF;
 ack:=public.fiscal_aprobar_revision_sin_presentacion(p_operacion_id,p_actor_auth_id,p_revision_id,p_solicitud_sha,p_revision);
 INSERT INTO public.fiscal_revisiones_presentacion_homologacion(revision_id,operacion_id,presentacion_sha256) VALUES(p_revision_id,p_operacion_id,p_presentacion_sha);
 anterior:=public.cargar_revision_presentacion_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id,p_revision_id);
 IF anterior IS NULL OR anterior->>'presentacion_sha256' IS DISTINCT FROM p_presentacion_sha THEN RAISE EXCEPTION 'Revisión sin cierre durable.' USING ERRCODE='40001'; END IF;
 RETURN anterior;
END $$;
-- 011 fija primero revision_aprobada_id; este trigger verifica ese mismo ID.
CREATE OR REPLACE FUNCTION public.fiscal_exigir_presentacion_para_envio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE datos public.fiscal_presentaciones_homologacion%ROWTYPE;
BEGIN
 IF OLD.usado_por_intento IS NULL AND NEW.usado_por_intento IS NOT NULL THEN
  SELECT * INTO datos FROM public.fiscal_presentaciones_homologacion WHERE operacion_id=NEW.operacion_id FOR SHARE;
  IF FOUND AND NOT EXISTS(SELECT 1 FROM public.fiscal_revisiones_presentacion_homologacion v JOIN public.fiscal_revisiones_homologacion r ON r.id=v.revision_id
   WHERE v.revision_id=NEW.revision_aprobada_id AND v.operacion_id=NEW.operacion_id AND v.presentacion_sha256=datos.presentacion_sha256
    AND r.actor_auth_id=datos.actor_auth_id AND r.solicitud_sha256=datos.solicitud_sha256 AND r.solicitud_sha256=NEW.solicitud_sha256) THEN
   RAISE EXCEPTION 'Falta revisión de representación exacta.' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_exigir_presentacion_para_envio() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_zz_presentacion_antes_envio ON public.fiscal_permisos_emision_homologacion;
CREATE TRIGGER fiscal_zz_presentacion_antes_envio BEFORE UPDATE ON public.fiscal_permisos_emision_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_exigir_presentacion_para_envio();
REVOKE ALL ON FUNCTION public.aprobar_revision_fiscal_homologacion(uuid,uuid,uuid,text,integer),public.cargar_revision_presentacion_homologacion(uuid,uuid,uuid,uuid),public.aprobar_revision_presentacion_homologacion(uuid,uuid,uuid,uuid,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aprobar_revision_fiscal_homologacion(uuid,uuid,uuid,text,integer),public.cargar_revision_presentacion_homologacion(uuid,uuid,uuid,uuid),public.aprobar_revision_presentacion_homologacion(uuid,uuid,uuid,uuid,text,integer,text) TO service_role;
COMMIT;
