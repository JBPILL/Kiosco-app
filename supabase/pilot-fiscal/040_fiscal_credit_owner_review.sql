-- Revisión humana NC durable; no permiso de envío ni emisión. Requiere001–039.
-- Instalación/activación remota requiere autorización específica.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_nc_revisiones_homologacion (
 id uuid PRIMARY KEY, solicitud_id uuid NOT NULL REFERENCES public.fiscal_nc_reservas_homologacion(solicitud_id),
 reserva_id uuid NOT NULL REFERENCES public.fiscal_nc_reservas_homologacion(reserva_id), actor_auth_id uuid NOT NULL,
 solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
 preparacion_sha256 text NOT NULL CHECK(preparacion_sha256 ~ '^[0-9a-f]{64}$'), contexto jsonb NOT NULL,
 creada_en timestamptz NOT NULL, vence_en timestamptz NOT NULL CHECK(vence_en=creada_en+interval '10 minutes')
);
ALTER TABLE public.fiscal_nc_revisiones_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_nc_revisiones_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid='public.fiscal_nc_revisiones_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.fiscal_nc_revisiones_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_nc_revisiones_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_nc_revisiones_homologacion','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Privilegios heredados en revisión NC.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_nc_revision_inmutable ON public.fiscal_nc_revisiones_homologacion;
CREATE TRIGGER fiscal_nc_revision_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_nc_revisiones_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();

CREATE OR REPLACE FUNCTION public.cargar_revision_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text,p_revision_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cuerpo jsonb; revision public.fiscal_nc_revisiones_homologacion%ROWTYPE; aprobacion jsonb:=NULL;
BEGIN
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF cuerpo IS NULL THEN RAISE EXCEPTION 'Requiere cuerpo NC reservado.' USING ERRCODE='55000'; END IF;
 IF p_revision_id IS NOT NULL THEN
  SELECT * INTO revision FROM public.fiscal_nc_revisiones_homologacion WHERE id=p_revision_id FOR SHARE;
  IF NOT FOUND OR revision.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR revision.solicitud_id IS DISTINCT FROM p_id
   OR revision.reserva_id::text IS DISTINCT FROM cuerpo#>>'{reserva,reserva_id}' OR revision.solicitud_sha256 IS DISTINCT FROM cuerpo#>>'{cuerpo,sha256}'
   OR revision.preparacion_sha256 IS DISTINCT FROM cuerpo#>>'{reserva,preparacion_sha256}' THEN RAISE EXCEPTION 'Revisión NC distinta.' USING ERRCODE='42501'; END IF;
  aprobacion:=jsonb_build_object('id',revision.id,'solicitud_id',revision.solicitud_id,'reserva_id',revision.reserva_id,
   'solicitud_sha256',revision.solicitud_sha256,'preparacion_sha256',revision.preparacion_sha256,'aprobada',true,
   'vence_en',revision.vence_en,'emision_habilitada',false);
 END IF;
 RETURN jsonb_build_object('version',1,'cuerpo',cuerpo,'aprobacion',aprobacion,'emision_habilitada',false);
END $$;

CREATE OR REPLACE FUNCTION public.aprobar_revision_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text,p_revision_id uuid,p_cuerpo_sha text,p_preparacion_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cuerpo jsonb; contexto jsonb; perfil public.usuarios%ROWTYPE; revision public.fiscal_nc_revisiones_homologacion%ROWTYPE; instante timestamptz;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Requiere trabajador privado NC.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Revisión NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 IF p_revision_id IS NULL OR p_cuerpo_sha IS NULL OR p_preparacion_sha IS NULL OR p_cuerpo_sha !~ '^[0-9a-f]{64}$' OR p_preparacion_sha !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Conservar identidad/cuerpo NC.' USING ERRCODE='22023'; END IF;
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF cuerpo IS NULL OR cuerpo#>>'{cuerpo,sha256}' IS DISTINCT FROM p_cuerpo_sha OR cuerpo#>>'{reserva,preparacion_sha256}' IS DISTINCT FROM p_preparacion_sha THEN RAISE EXCEPTION 'Cuerpo NC distinto.' USING ERRCODE='22023'; END IF;
 SELECT * INTO revision FROM public.fiscal_nc_revisiones_homologacion WHERE id=p_revision_id FOR SHARE;
 IF FOUND THEN
  -- Replay histórico conserva vencimiento; no acredita autoridad vigente.
  RETURN public.cargar_revision_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha,p_revision_id);
 END IF;
 BEGIN SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Revisión NC no autorizada.' USING ERRCODE='42501'; END;
 IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin IS DISTINCT FROM false OR perfil.kiosco_id IS NULL THEN RAISE EXCEPTION 'Revisión NC no autorizada.' USING ERRCODE='42501'; END IF;
 contexto:=public.cargar_contexto_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF contexto IS DISTINCT FROM cuerpo#>'{preparacion,contexto}' THEN RAISE EXCEPTION 'Contexto NC cambió.' USING ERRCODE='22023'; END IF;
 instante:=clock_timestamp();
 INSERT INTO public.fiscal_nc_revisiones_homologacion(id,solicitud_id,reserva_id,actor_auth_id,solicitud_sha256,preparacion_sha256,contexto,creada_en,vence_en)
 VALUES(p_revision_id,p_id,(cuerpo#>>'{reserva,reserva_id}')::uuid,p_actor_auth_id,p_cuerpo_sha,p_preparacion_sha,contexto,instante,instante+interval '10 minutes') ON CONFLICT(id) DO NOTHING;
 -- Un conflicto pudo esperar: revalidar vigencia antes de acreditar el guardado.
 IF public.cargar_contexto_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha) IS DISTINCT FROM contexto THEN RAISE EXCEPTION 'Contexto NC cambió.' USING ERRCODE='22023'; END IF;
 RETURN public.cargar_revision_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha,p_revision_id);
END $$;
REVOKE ALL ON FUNCTION public.cargar_revision_nc_homologacion(uuid,uuid,uuid,uuid,text,uuid),public.aprobar_revision_nc_homologacion(uuid,uuid,uuid,uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_revision_nc_homologacion(uuid,uuid,uuid,uuid,text,uuid),public.aprobar_revision_nc_homologacion(uuid,uuid,uuid,uuid,text,uuid,text,text) TO service_role;
COMMIT;
