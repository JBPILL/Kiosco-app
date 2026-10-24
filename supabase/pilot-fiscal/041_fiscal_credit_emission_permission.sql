-- Permiso privado NC exacto, vacío/deshabilitado por defecto. Requiere001–040.
-- Verificar NO consume ni autoriza transporte: futura intención debe hacerlo
-- atómicamente en la misma transacción. Sin instalación/activación remota automática.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_nc_permisos_homologacion (
 id uuid PRIMARY KEY, solicitud_id uuid NOT NULL REFERENCES public.fiscal_nc_reservas_homologacion(solicitud_id),
 reserva_id uuid NOT NULL REFERENCES public.fiscal_nc_reservas_homologacion(reserva_id),
 revision_id uuid NOT NULL REFERENCES public.fiscal_nc_revisiones_homologacion(id), actor_auth_id uuid NOT NULL,
 solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'), preparacion_sha256 text NOT NULL CHECK(preparacion_sha256 ~ '^[0-9a-f]{64}$'),
 credencial_id uuid NOT NULL, certificado_sha256 text NOT NULL CHECK(certificado_sha256 ~ '^[0-9a-f]{64}$'), emisor_revision integer NOT NULL CHECK(emisor_revision>0),
 habilitado boolean NOT NULL DEFAULT false, creado_en timestamptz NOT NULL DEFAULT clock_timestamp(), vence_en timestamptz NOT NULL,
 CHECK(isfinite(creado_en) AND isfinite(vence_en) AND vence_en>creado_en AND vence_en<=creado_en+interval '10 minutes')
);
CREATE TABLE IF NOT EXISTS public.fiscal_nc_permisos_revocados_homologacion (
 permiso_id uuid PRIMARY KEY REFERENCES public.fiscal_nc_permisos_homologacion(id),
 motivo text NOT NULL CHECK(length(btrim(motivo)) BETWEEN 1 AND 256), creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE tabla text; columnas text; rol text; BEGIN
 FOREACH tabla IN ARRAY ARRAY['fiscal_nc_permisos_homologacion','fiscal_nc_permisos_revocados_homologacion'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tabla);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tabla);
  SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid=('public.'||tabla)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas,tabla);
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Permiso NC expuesto.'; END IF;
  END LOOP;
  EXECUTE format('DROP TRIGGER IF EXISTS fiscal_nc_permiso_inmutable ON public.%I',tabla);
  EXECUTE format('CREATE TRIGGER fiscal_nc_permiso_inmutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable()',tabla);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.verificar_permiso_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text,p_cuerpo_sha text,p_revision_id uuid,p_permiso_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE perfil public.usuarios%ROWTYPE; emisor public.fiscal_emisores_homologacion%ROWTYPE;
 revision public.fiscal_nc_revisiones_homologacion%ROWTYPE; permiso public.fiscal_nc_permisos_homologacion%ROWTYPE;
 cuerpo jsonb; contexto jsonb;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Requiere trabajador privado NC.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Permiso NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 IF p_revision_id IS NULL OR p_permiso_id IS NULL OR p_cuerpo_sha IS NULL OR p_cuerpo_sha !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Conservar identidad/cuerpo NC.' USING ERRCODE='22023'; END IF;
 BEGIN SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Permiso NC no autorizado.' USING ERRCODE='42501'; END;
 IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin IS DISTINCT FROM false OR perfil.kiosco_id IS NULL THEN RAISE EXCEPTION 'Permiso NC no autorizado.' USING ERRCODE='42501'; END IF;
 cuerpo:=public.cargar_revision_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha,p_revision_id);
 IF cuerpo#>>'{cuerpo,cuerpo,sha256}' IS DISTINCT FROM p_cuerpo_sha THEN RAISE EXCEPTION 'Cuerpo NC distinto.' USING ERRCODE='22023'; END IF;
 SELECT * INTO revision FROM public.fiscal_nc_revisiones_homologacion WHERE id=p_revision_id FOR SHARE;
 contexto:=public.cargar_contexto_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF contexto IS DISTINCT FROM revision.contexto OR contexto IS DISTINCT FROM cuerpo#>'{cuerpo,preparacion,contexto}' THEN RAISE EXCEPTION 'Contexto NC cambió.' USING ERRCODE='22023'; END IF;
 SELECT * INTO emisor FROM public.fiscal_emisores_homologacion WHERE kiosco_id=perfil.kiosco_id AND habilitado FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Emisor NC no disponible.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.fiscal_nc_series_homologacion WHERE cuit_emisor=emisor.cuit_emisor AND punto_venta=emisor.punto_venta AND tipo_comprobante=(contexto->>'tipo_nota_credito')::integer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Serie NC no disponible.' USING ERRCODE='55000'; END IF;
 SELECT * INTO permiso FROM public.fiscal_nc_permisos_homologacion WHERE id=p_permiso_id FOR UPDATE;
 IF NOT FOUND OR permiso.habilitado IS DISTINCT FROM true OR permiso.solicitud_id IS DISTINCT FROM p_id OR permiso.revision_id IS DISTINCT FROM p_revision_id
  OR permiso.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR permiso.reserva_id IS DISTINCT FROM revision.reserva_id
  OR permiso.solicitud_sha256 IS DISTINCT FROM p_cuerpo_sha OR permiso.preparacion_sha256 IS DISTINCT FROM revision.preparacion_sha256
  OR permiso.credencial_id IS DISTINCT FROM emisor.credencial_id OR permiso.certificado_sha256 IS DISTINCT FROM emisor.certificado_sha256
  OR permiso.emisor_revision IS DISTINCT FROM emisor.revision OR permiso.creado_en<revision.creada_en OR permiso.creado_en>clock_timestamp()
  OR permiso.vence_en<=clock_timestamp() OR permiso.vence_en>revision.vence_en OR revision.creada_en>clock_timestamp() OR revision.vence_en<=clock_timestamp()
  OR EXISTS(SELECT 1 FROM public.fiscal_nc_permisos_revocados_homologacion WHERE permiso_id=p_permiso_id) THEN RAISE EXCEPTION 'Permiso NC no vigente para este cuerpo.' USING ERRCODE='42501'; END IF;
 -- Revalidar después de esperar serie/permiso: ningún timeout concede vigencia.
 IF public.cargar_contexto_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha) IS DISTINCT FROM contexto
  OR permiso.vence_en<=clock_timestamp() OR revision.vence_en<=clock_timestamp() THEN RAISE EXCEPTION 'Permiso NC vencido o contexto distinto.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version',1,'estado','PERMISO_NC_VERIFICADO','solicitud_id',p_id,'reserva_id',permiso.reserva_id,
  'solicitud_sha256',p_cuerpo_sha,'preparacion_sha256',permiso.preparacion_sha256,'revision_id',p_revision_id,'permiso_id',p_permiso_id,
  'actor_auth_id',p_actor_auth_id,'vence_en',permiso.vence_en,'emision_habilitada',false);
END $$;
REVOKE ALL ON FUNCTION public.verificar_permiso_nc_homologacion(uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.verificar_permiso_nc_homologacion(uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO service_role;
COMMIT;
