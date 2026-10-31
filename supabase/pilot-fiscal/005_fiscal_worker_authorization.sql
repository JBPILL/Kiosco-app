-- F04: autorización privada de consulta fiscal. Requiere 001–004.
-- No contiene claves/certificados/TA. Sin filas habilitadas por defecto.
-- Provisionar metadatos requiere gate de custodia e instalación independiente.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_emisores_homologacion (
  kiosco_id uuid PRIMARY KEY REFERENCES public.kioscos(id),
  cuit_emisor text NOT NULL CHECK(cuit_emisor ~ '^[0-9]{11}$'),
  punto_venta integer NOT NULL CHECK(punto_venta BETWEEN 1 AND 99999),
  credencial_id uuid NOT NULL,
  certificado_sha256 text NOT NULL CHECK(certificado_sha256 ~ '^[0-9a-f]{64}$'),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  habilitado boolean NOT NULL DEFAULT false,
  actualizado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.fiscal_emisores_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_emisores_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
    WHERE attrelid='public.fiscal_emisores_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), SELECT (%s), REFERENCES (%s) ON public.fiscal_emisores_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(rol,'public.fiscal_emisores_homologacion','SELECT,INSERT,UPDATE,DELETE')
      OR has_any_column_privilege(rol,'public.fiscal_emisores_homologacion','SELECT,INSERT,UPDATE') THEN
      RAISE EXCEPTION 'Privilegios heredados en emisor fiscal privado.';
    END IF;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.autorizar_consulta_fiscal_homologacion(p_actor_auth_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE perfil public.usuarios%ROWTYPE; op public.fiscal_operaciones_homologacion%ROWTYPE;
  emisor public.fiscal_emisores_homologacion%ROWTYPE;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN
    RAISE EXCEPTION 'Se requiere trabajador fiscal privado.' USING ERRCODE='42501'; END IF;
  BEGIN
    SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Consulta fiscal no autorizada.' USING ERRCODE='42501'; END;
  IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin OR perfil.kiosco_id IS NULL THEN
    RAISE EXCEPTION 'Consulta fiscal no autorizada.' USING ERRCODE='42501'; END IF;
  -- Orden compatible: perfil → comercio/venta/operación → emisor.
  -- No devuelve existencia/propiedad de operaciones ajenas.
  SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id
    AND usuario_id=perfil.id AND kiosco_id=perfil.kiosco_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consulta fiscal no autorizada.' USING ERRCODE='42501'; END IF;
  op:=public.fiscal_operacion_vigente_homologacion(p_operacion_id);
  SELECT * INTO emisor FROM public.fiscal_emisores_homologacion WHERE kiosco_id=op.kiosco_id AND habilitado FOR SHARE;
  IF NOT FOUND OR emisor.cuit_emisor IS DISTINCT FROM op.contexto->>'cuit_emisor'
    OR emisor.punto_venta IS DISTINCT FROM (op.contexto->>'punto_venta')::integer THEN
    RAISE EXCEPTION 'Consulta fiscal no autorizada.' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('version',1,'entorno','HOMOLOGACION','servicio','wsfe',
    'operacion_id',op.id,'kiosco_id',op.kiosco_id,'usuario_id',perfil.id,
    'cuit_emisor',emisor.cuit_emisor,'punto_venta',emisor.punto_venta,
    'credencial_id',emisor.credencial_id,'certificado_sha256',emisor.certificado_sha256,'revision',emisor.revision);
END;
$$;
REVOKE ALL ON FUNCTION public.autorizar_consulta_fiscal_homologacion(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.autorizar_consulta_fiscal_homologacion(uuid,uuid) TO service_role;
COMMIT;
