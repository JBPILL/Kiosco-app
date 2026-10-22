-- PR03: revisión humana, separada del permiso privado de emisión. Requiere 001–010.
-- Sin filas, flags, grants de tablas ni tráfico ARCA. Instalación por gate separado.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_revisiones_homologacion (
 id uuid PRIMARY KEY,
 operacion_id uuid NOT NULL REFERENCES public.fiscal_solicitudes_homologacion(operacion_id),
 usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
 actor_auth_id uuid NOT NULL,
 solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
 solicitud_revision integer NOT NULL CHECK(solicitud_revision>0),
 credencial_id uuid NOT NULL,
 certificado_sha256 text NOT NULL CHECK(certificado_sha256 ~ '^[0-9a-f]{64}$'),
 emisor_revision integer NOT NULL CHECK(emisor_revision>0),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 vence_en timestamptz NOT NULL,
 CHECK(vence_en>creado_en AND vence_en<=creado_en+interval '10 minutes')
);
CREATE INDEX IF NOT EXISTS fiscal_revision_operacion ON public.fiscal_revisiones_homologacion(operacion_id,creado_en DESC);
ALTER TABLE public.fiscal_revisiones_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_revisiones_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
 WHERE attrelid='public.fiscal_revisiones_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), SELECT (%s), REFERENCES (%s) ON public.fiscal_revisiones_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_revisiones_homologacion','SELECT,INSERT,UPDATE,DELETE')
   OR has_any_column_privilege(rol,'public.fiscal_revisiones_homologacion','SELECT,INSERT,UPDATE') THEN
   RAISE EXCEPTION 'Privilegios heredados en revisión fiscal privada.';
  END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.fiscal_revision_inmutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 RAISE EXCEPTION 'La revisión fiscal conserva su auditoría inmutable.' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION public.fiscal_revision_inmutable() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_revision_inmutable ON public.fiscal_revisiones_homologacion;
CREATE TRIGGER fiscal_revision_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_revisiones_homologacion
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();

CREATE OR REPLACE FUNCTION public.cargar_revision_fiscal_homologacion(p_operacion_id uuid,p_actor_auth_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE binding jsonb; usuario uuid; solicitud public.fiscal_solicitudes_homologacion%ROWTYPE;
 reserva public.fiscal_reservas_homologacion%ROWTYPE; revision public.fiscal_revisiones_homologacion%ROWTYPE;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador fiscal privado requerido.' USING ERRCODE='42501'; END IF;
 binding:=public.autorizar_consulta_fiscal_homologacion(p_actor_auth_id,p_operacion_id);
 usuario:=(binding->>'usuario_id')::uuid;
 -- El gate ya tomó perfil → comercio → venta → operación → emisor.
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
 SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
 IF solicitud.operacion_id IS NULL OR reserva.operacion_id IS NULL OR solicitud.solicitud_sha256 IS DISTINCT FROM reserva.solicitud_sha256 THEN
  RAISE EXCEPTION 'Falta cuerpo fiscal durable.' USING ERRCODE='22023'; END IF;
 SELECT * INTO revision FROM public.fiscal_revisiones_homologacion
 WHERE operacion_id=p_operacion_id AND usuario_id=usuario AND actor_auth_id=p_actor_auth_id AND solicitud_sha256=solicitud.solicitud_sha256
 AND solicitud_revision=solicitud.revision AND credencial_id::text=binding->>'credencial_id'
 AND certificado_sha256=binding->>'certificado_sha256' AND emisor_revision=(binding->>'revision')::integer
 AND creado_en<=clock_timestamp() AND vence_en>clock_timestamp() ORDER BY creado_en DESC,id LIMIT 1;
 RETURN jsonb_build_object('operacion_id',p_operacion_id,'estado',reserva.estado,'revision',solicitud.revision,
  'solicitud',jsonb_build_object('version',1,'solicitud',solicitud.cuerpo,'sha256',solicitud.solicitud_sha256),
  'aprobacion',CASE WHEN revision.id IS NULL THEN NULL ELSE jsonb_build_object('id',revision.id,'operacion_id',p_operacion_id,
   'solicitud_sha256',revision.solicitud_sha256,'revision',revision.solicitud_revision,'aprobada',true,'vence_en',revision.vence_en,'emision_habilitada',false) END);
END $$;

CREATE OR REPLACE FUNCTION public.aprobar_revision_fiscal_homologacion(p_operacion_id uuid,p_actor_auth_id uuid,p_id uuid,p_sha text,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE contexto jsonb; binding jsonb; usuario uuid; anterior public.fiscal_revisiones_homologacion%ROWTYPE; instante timestamptz;
BEGIN
 contexto:=public.cargar_revision_fiscal_homologacion(p_operacion_id,p_actor_auth_id);
 IF p_id IS NULL OR p_sha IS NULL OR p_sha !~ '^[0-9a-f]{64}$' OR p_revision IS NULL
  OR contexto#>>'{solicitud,sha256}' IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'Cambió el cuerpo a revisar.' USING ERRCODE='40001'; END IF;
 binding:=public.autorizar_consulta_fiscal_homologacion(p_actor_auth_id,p_operacion_id);
 usuario:=(binding->>'usuario_id')::uuid;
 SELECT * INTO anterior FROM public.fiscal_revisiones_homologacion WHERE id=p_id;
 IF anterior.id IS NOT NULL THEN
  IF anterior.operacion_id IS DISTINCT FROM p_operacion_id OR anterior.usuario_id IS DISTINCT FROM usuario
   OR anterior.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR anterior.solicitud_sha256 IS DISTINCT FROM p_sha OR anterior.solicitud_revision IS DISTINCT FROM p_revision
   OR anterior.credencial_id::text IS DISTINCT FROM binding->>'credencial_id'
   OR anterior.certificado_sha256 IS DISTINCT FROM binding->>'certificado_sha256' OR anterior.emisor_revision IS DISTINCT FROM (binding->>'revision')::integer THEN
   RAISE EXCEPTION 'Identidad de revisión ya utilizada.' USING ERRCODE='42501'; END IF;
 ELSE
  IF contexto->>'estado' IS DISTINCT FROM 'RESERVADA' OR (contexto->>'revision')::integer IS DISTINCT FROM p_revision THEN
   RAISE EXCEPTION 'La revisión no admite otra aprobación.' USING ERRCODE='55000'; END IF;
  instante:=clock_timestamp();
  INSERT INTO public.fiscal_revisiones_homologacion(id,operacion_id,usuario_id,actor_auth_id,solicitud_sha256,solicitud_revision,credencial_id,certificado_sha256,emisor_revision,creado_en,vence_en)
  VALUES(p_id,p_operacion_id,usuario,p_actor_auth_id,p_sha,p_revision,(binding->>'credencial_id')::uuid,binding->>'certificado_sha256',(binding->>'revision')::integer,instante,instante+interval '10 minutes')
  ON CONFLICT DO NOTHING RETURNING * INTO anterior;
  IF anterior.id IS NULL THEN RAISE EXCEPTION 'No se confirmó revisión; recuperar con su identidad original.' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN jsonb_build_object('id',anterior.id,'operacion_id',anterior.operacion_id,'solicitud_sha256',anterior.solicitud_sha256,
  'revision',anterior.solicitud_revision,'aprobada',true,'vence_en',anterior.vence_en,'emision_habilitada',false);
END $$;
REVOKE ALL ON FUNCTION public.cargar_revision_fiscal_homologacion(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.aprobar_revision_fiscal_homologacion(uuid,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_revision_fiscal_homologacion(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.aprobar_revision_fiscal_homologacion(uuid,uuid,uuid,text,integer) TO service_role;

ALTER TABLE public.fiscal_permisos_emision_homologacion ADD COLUMN IF NOT EXISTS revision_aprobada_id uuid REFERENCES public.fiscal_revisiones_homologacion(id);
REVOKE SELECT(revision_aprobada_id),INSERT(revision_aprobada_id),UPDATE(revision_aprobada_id),REFERENCES(revision_aprobada_id)
 ON public.fiscal_permisos_emision_homologacion FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fiscal_exigir_revision_para_envio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE revision public.fiscal_revisiones_homologacion%ROWTYPE; instante timestamptz;
BEGIN
 IF OLD.usado_por_intento IS NULL AND NEW.usado_por_intento IS NOT NULL THEN
  SELECT r.* INTO revision FROM public.fiscal_revisiones_homologacion r
  JOIN public.fiscal_operaciones_homologacion o ON o.id=r.operacion_id AND o.usuario_id=r.usuario_id
  JOIN public.usuarios u ON u.id=r.usuario_id AND u.auth_user_id=r.actor_auth_id
  JOIN public.fiscal_solicitudes_homologacion s ON s.operacion_id=r.operacion_id
  WHERE r.operacion_id=NEW.operacion_id AND r.solicitud_sha256=NEW.solicitud_sha256 AND r.solicitud_revision=s.revision
   AND r.credencial_id=NEW.credencial_id AND r.certificado_sha256=NEW.certificado_sha256 AND r.emisor_revision=NEW.emisor_revision
   AND r.creado_en<=clock_timestamp() AND r.vence_en>clock_timestamp()
  ORDER BY r.creado_en DESC,r.id LIMIT 1 FOR SHARE OF r;
  -- clock_timestamp después de adquirir el lock: la espera no renueva permisos.
  instante:=clock_timestamp();
  IF revision.id IS NULL OR revision.creado_en>instante OR revision.vence_en<=instante
   OR NOT NEW.habilitado OR NEW.creado_en>instante OR NEW.vence_en<=instante THEN
   RAISE EXCEPTION 'Falta revisión o permiso vigente del Dueño para este cuerpo.' USING ERRCODE='42501'; END IF;
  NEW.revision_aprobada_id:=revision.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_exigir_revision_para_envio() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_revision_antes_envio ON public.fiscal_permisos_emision_homologacion;
CREATE TRIGGER fiscal_revision_antes_envio BEFORE UPDATE ON public.fiscal_permisos_emision_homologacion
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_exigir_revision_para_envio();
-- La identidad verificada acompaña la intención hasta la misma transacción.
CREATE OR REPLACE FUNCTION public.registrar_envio_revisado_homologacion(p_actor_auth_id uuid,p_operacion_id uuid,p_intento_id uuid,p_sha text,p_autorizacion_id uuid,p_ultimo_autorizado integer,p_consultado_en timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 PERFORM public.autorizar_consulta_fiscal_homologacion(p_actor_auth_id,p_operacion_id);
 RETURN public.registrar_envio_fiscal_homologacion(p_operacion_id,p_intento_id,p_sha,p_autorizacion_id,p_ultimo_autorizado,p_consultado_en);
END $$;
REVOKE ALL ON FUNCTION public.registrar_envio_fiscal_homologacion(uuid,uuid,text,uuid,integer,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.registrar_envio_revisado_homologacion(uuid,uuid,uuid,text,uuid,integer,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_envio_revisado_homologacion(uuid,uuid,uuid,text,uuid,integer,timestamptz) TO service_role;
COMMIT;
