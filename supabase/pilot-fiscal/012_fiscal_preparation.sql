-- F08 local: datos explícitos antes de reservar numeración. Requiere 001–011.
-- Sin filas habilitadas ni emisión. Instalar/provisionar requiere otro gate.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_parametros_homologacion (
 revision integer PRIMARY KEY CHECK(revision>0),
 condiciones jsonb NOT NULL CHECK(jsonb_typeof(condiciones)='array' AND jsonb_array_length(condiciones) BETWEEN 1 AND 100),
 alicuotas jsonb NOT NULL CHECK(jsonb_typeof(alicuotas)='array' AND jsonb_array_length(alicuotas)<=100),
 fuente_sha256 text NOT NULL CHECK(fuente_sha256 ~ '^[0-9a-f]{64}$'),
 consultado_en timestamptz NOT NULL,
 vence_en timestamptz NOT NULL CHECK(vence_en>consultado_en),
 habilitado boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.fiscal_preparaciones_homologacion (
 operacion_id uuid PRIMARY KEY REFERENCES public.fiscal_operaciones_homologacion(id),
 actor_auth_id uuid NOT NULL,
 canonico text NOT NULL CHECK(octet_length(canonico)<=262144),
 datos jsonb NOT NULL CHECK(jsonb_typeof(datos)='object'),
 preparacion_sha256 text NOT NULL CHECK(preparacion_sha256 ~ '^[0-9a-f]{64}$'),
 parametros_revision integer NOT NULL REFERENCES public.fiscal_parametros_homologacion(revision),
 credencial_id uuid NOT NULL,
 certificado_sha256 text NOT NULL CHECK(certificado_sha256 ~ '^[0-9a-f]{64}$'),
 emisor_revision integer NOT NULL CHECK(emisor_revision>0),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(datos=canonico::jsonb),
 CHECK(preparacion_sha256=encode(sha256(convert_to(canonico,'UTF8')),'hex'))
);
ALTER TABLE public.fiscal_parametros_homologacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_preparaciones_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_parametros_homologacion,public.fiscal_preparaciones_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE tabla text; columnas text; rol text; BEGIN
 FOREACH tabla IN ARRAY ARRAY['fiscal_parametros_homologacion','fiscal_preparaciones_homologacion'] LOOP
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
   WHERE attrelid=('public.'||tabla)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), SELECT (%s), REFERENCES (%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas,tabla);
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'Privilegios heredados en preparación fiscal.';
   END IF;
  END LOOP;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_preparacion_inmutable ON public.fiscal_preparaciones_homologacion;
CREATE TRIGGER fiscal_preparacion_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_preparaciones_homologacion
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();
-- Catálogo sólo revocable: corregir datos requiere una revisión nueva.
CREATE OR REPLACE FUNCTION public.fiscal_parametros_inmutables() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Conservar catálogo fiscal histórico.' USING ERRCODE='55000'; END IF;
 IF (to_jsonb(NEW)-'habilitado') IS DISTINCT FROM (to_jsonb(OLD)-'habilitado') THEN
  RAISE EXCEPTION 'Crear nueva revisión de parámetros fiscales.' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_parametros_inmutables() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_parametros_inmutables ON public.fiscal_parametros_homologacion;
CREATE TRIGGER fiscal_parametros_inmutables BEFORE UPDATE OR DELETE ON public.fiscal_parametros_homologacion
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_parametros_inmutables();

CREATE OR REPLACE FUNCTION public.fiscal_venta_preparacion_homologacion(p_actor_auth_id uuid,p_venta_id uuid)
RETURNS public.ventas LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE perfil public.usuarios%ROWTYPE; venta public.ventas%ROWTYPE;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) OR current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Trabajador privado con aislamiento compatible requerido.' USING ERRCODE='42501'; END IF;
 BEGIN
  SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Preparación fiscal no autorizada.' USING ERRCODE='42501'; END;
 IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin OR perfil.kiosco_id IS NULL THEN
  RAISE EXCEPTION 'Preparación fiscal no autorizada.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.kioscos WHERE id=perfil.kiosco_id AND estado_suscripcion='ACTIVO' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Preparación fiscal no autorizada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO venta FROM public.ventas WHERE id=p_venta_id AND kiosco_id=perfil.kiosco_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Preparación fiscal no autorizada.' USING ERRCODE='42501'; END IF;
 RETURN venta;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_venta_preparacion_homologacion(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cargar_datos_preparacion_homologacion(p_actor_auth_id uuid,p_venta_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE;
 emisor public.fiscal_emisores_homologacion%ROWTYPE; parametros public.fiscal_parametros_homologacion%ROWTYPE;
BEGIN
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 IF venta.estado IS DISTINCT FROM 'COMPLETADA' OR venta.total IS NULL OR venta.total<=0
  OR nullif(btrim(to_jsonb(venta)->>'afip_cae'),'') IS NOT NULL
  OR EXISTS(SELECT 1 FROM public.devoluciones_venta WHERE venta_id=venta.id)
  OR NOT EXISTS(SELECT 1 FROM public.detalles_venta WHERE venta_id=venta.id) THEN
  RAISE EXCEPTION 'Venta no disponible para preparación fiscal.' USING ERRCODE='22023'; END IF;
 SELECT * INTO emisor FROM public.fiscal_emisores_homologacion WHERE kiosco_id=venta.kiosco_id AND habilitado FOR SHARE;
 IF NOT FOUND OR emisor.punto_venta>99998 THEN RAISE EXCEPTION 'Emisor fiscal no disponible.' USING ERRCODE='42501'; END IF;
 SELECT * INTO parametros FROM public.fiscal_parametros_homologacion
  WHERE habilitado AND consultado_en<=clock_timestamp() AND vence_en>clock_timestamp() ORDER BY revision DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND OR parametros.consultado_en>clock_timestamp() OR parametros.vence_en<=clock_timestamp() THEN
  RAISE EXCEPTION 'Faltan parámetros fiscales vigentes.' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('version',1,'venta_id',venta.id,'total',to_char(venta.total,'FM9999999990.00'),
  'cuit_emisor',emisor.cuit_emisor,'punto_venta',emisor.punto_venta,'revision_parametros',parametros.revision,
  'incluye_recepcion_envases',EXISTS(SELECT 1 FROM public.detalles_venta WHERE venta_id=venta.id AND es_devolucion_envase),
  'condiciones',parametros.condiciones,'alicuotas',parametros.alicuotas);
END $$;

CREATE OR REPLACE FUNCTION public.resolver_preparacion_fiscal_homologacion(p_actor_auth_id uuid,p_venta_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE; op public.fiscal_operaciones_homologacion%ROWTYPE;
 previa public.fiscal_preparaciones_homologacion%ROWTYPE; reserva public.fiscal_reservas_homologacion%ROWTYPE;
 estado text; operacion uuid; preparacion_sha text;
BEGIN
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 IF nullif(btrim(to_jsonb(venta)->>'afip_cae'),'') IS NOT NULL THEN estado:='REGISTRO_FISCAL_HEREDADO';
 ELSE
  SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE kiosco_id=venta.kiosco_id AND venta_id=venta.id AND entorno='HOMOLOGACION' FOR UPDATE;
  IF NOT FOUND THEN
   estado:=CASE WHEN venta.estado='COMPLETADA' AND venta.total>0 AND EXISTS(SELECT 1 FROM public.detalles_venta WHERE venta_id=venta.id) THEN 'SIN_PREPARACION' ELSE 'NO_DISPONIBLE' END;
  ELSE
   SELECT * INTO previa FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=op.id;
   IF NOT FOUND OR previa.actor_auth_id IS DISTINCT FROM p_actor_auth_id
    OR op.usuario_id IS DISTINCT FROM (SELECT id FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo) THEN
    estado:='REQUIERE_REVISION';
   ELSE
    BEGIN
     op:=public.fiscal_operacion_vigente_homologacion(op.id);
     SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=op.id FOR SHARE;
     estado:=CASE WHEN FOUND THEN reserva.estado ELSE 'DATOS_PREPARADOS' END;
     operacion:=op.id;preparacion_sha:=previa.preparacion_sha256;
    EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '42501' THEN estado:='REQUIERE_REVISION';
    END;
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('venta_id',venta.id,'estado',estado,'operacion_id',operacion,'preparacion_sha256',preparacion_sha,'emision_habilitada',false);
END $$;

CREATE OR REPLACE FUNCTION public.guardar_datos_preparacion_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid,p_canonico text,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE contexto jsonb; propuesta jsonb; cuerpo jsonb; emisor public.fiscal_emisores_homologacion%ROWTYPE;
 perfil public.usuarios%ROWTYPE; venta public.ventas%ROWTYPE; op public.fiscal_operaciones_homologacion%ROWTYPE;
 previa public.fiscal_preparaciones_homologacion%ROWTYPE; snapshot jsonb; detalles jsonb; fiscal_context jsonb;
BEGIN
 contexto:=public.cargar_datos_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 IF p_operacion_id IS NULL OR p_canonico IS NULL OR octet_length(p_canonico)>262144 OR p_sha IS NULL
  OR p_sha IS DISTINCT FROM encode(sha256(convert_to(p_canonico,'UTF8')),'hex') THEN
  RAISE EXCEPTION 'Preparación inválida.' USING ERRCODE='22023'; END IF;
 propuesta:=p_canonico::jsonb;
 IF jsonb_typeof(propuesta) IS DISTINCT FROM 'object' OR NOT propuesta ?& ARRAY['version','venta_id','condicionEmisor','revision_parametros','datos']
  OR (SELECT count(*) FROM jsonb_object_keys(propuesta))<>5 OR propuesta->'version' IS DISTINCT FROM '1'::jsonb
  OR propuesta->>'venta_id' IS DISTINCT FROM p_venta_id::text OR propuesta->'revision_parametros' IS DISTINCT FROM contexto->'revision_parametros'
  OR jsonb_typeof(propuesta->'condicionEmisor') IS DISTINCT FROM 'string'
  OR propuesta->>'condicionEmisor' NOT IN ('MONOTRIBUTO','EXENTO','RESPONSABLE_INSCRIPTO')
  OR jsonb_typeof(propuesta->'datos') IS DISTINCT FROM 'object' OR (propuesta->'datos') ? 'numero'
  OR (contexto->>'incluye_recepcion_envases')::boolean THEN
  RAISE EXCEPTION 'Preparación explícita incompatible.' USING ERRCODE='22023'; END IF;
 cuerpo:=propuesta->'datos';
 IF cuerpo->>'cuitEmisor' IS DISTINCT FROM contexto->>'cuit_emisor' OR cuerpo->'puntoVenta' IS DISTINCT FROM contexto->'punto_venta'
  OR cuerpo#>>'{importes,total}' IS DISTINCT FROM contexto->>'total'
  OR (propuesta->>'condicionEmisor'='RESPONSABLE_INSCRIPTO' AND cuerpo->'tipoComprobante' NOT IN ('1'::jsonb,'6'::jsonb))
  OR (propuesta->>'condicionEmisor'<>'RESPONSABLE_INSCRIPTO' AND cuerpo->'tipoComprobante' IS DISTINCT FROM '11'::jsonb)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(contexto->'condiciones') c WHERE c->'id'=cuerpo->'condicionIvaReceptor' AND (c->'comprobantes') @> jsonb_build_array(cuerpo->'tipoComprobante'))
  OR jsonb_typeof(cuerpo->'iva') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Datos fiscales incompatibles con servidor.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(cuerpo->'iva') i WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(contexto->'alicuotas') a WHERE a->'id'=i->'id')) THEN
  RAISE EXCEPTION 'Alícuota fuera del catálogo.' USING ERRCODE='22023'; END IF;
 IF cuerpo->'tipoComprobante'='11'::jsonb AND (cuerpo#>>'{importes,noGravado}' IS DISTINCT FROM '0.00' OR cuerpo#>>'{importes,exento}' IS DISTINCT FROM '0.00') THEN
  RAISE EXCEPTION 'Importes incompatibles con clase C.' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo;
 SELECT * INTO STRICT venta FROM public.ventas WHERE id=p_venta_id;
 SELECT * INTO STRICT emisor FROM public.fiscal_emisores_homologacion WHERE kiosco_id=perfil.kiosco_id;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]'::jsonb) INTO detalles FROM public.detalles_venta d WHERE d.venta_id=venta.id;
 snapshot:=jsonb_build_object('version',1,'venta_id',venta.id,'kiosco_id',venta.kiosco_id,'total',venta.total,
  'fecha_hora',to_char(venta.fecha_hora AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'detalles',detalles);
 fiscal_context:=jsonb_build_object('version',1,'cuit_emisor',contexto->>'cuit_emisor','punto_venta',contexto->'punto_venta',
  'tipo_comprobante',cuerpo->'tipoComprobante','tipo_doc_receptor',cuerpo->'tipoDocumento','nro_doc_receptor',cuerpo->>'numeroDocumento');
 SELECT * INTO previa FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=p_operacion_id;
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id FOR UPDATE;
 IF op.id IS NOT NULL AND (previa.operacion_id IS NULL OR op.venta_id IS DISTINCT FROM venta.id OR op.kiosco_id IS DISTINCT FROM perfil.kiosco_id
  OR op.usuario_id IS DISTINCT FROM perfil.id OR op.contexto IS DISTINCT FROM fiscal_context OR op.venta_snapshot IS DISTINCT FROM snapshot
  OR previa.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR previa.canonico IS DISTINCT FROM p_canonico OR previa.preparacion_sha256 IS DISTINCT FROM p_sha
  OR previa.credencial_id IS DISTINCT FROM emisor.credencial_id OR previa.certificado_sha256 IS DISTINCT FROM emisor.certificado_sha256 OR previa.emisor_revision IS DISTINCT FROM emisor.revision) THEN
  RAISE EXCEPTION 'La preparación ya pertenece a otra solicitud o cambió su contexto.' USING ERRCODE='40001'; END IF;
 INSERT INTO public.fiscal_operaciones_homologacion(id,kiosco_id,venta_id,usuario_id,contexto,venta_snapshot)
  VALUES(p_operacion_id,perfil.kiosco_id,venta.id,perfil.id,fiscal_context,snapshot) ON CONFLICT DO NOTHING;
 IF op.id IS NULL AND NOT FOUND THEN RAISE EXCEPTION 'La venta ya tiene otra operación.' USING ERRCODE='40001'; END IF;
 -- Validar el mismo contrato SQL final sin persistir ni reservar el número estructural.
 cuerpo:=cuerpo||jsonb_build_object('numero',1);
 PERFORM public.fiscal_validar_cuerpo_homologacion(p_operacion_id,cuerpo::text,encode(sha256(convert_to(cuerpo::text,'UTF8')),'hex'));
 INSERT INTO public.fiscal_preparaciones_homologacion(operacion_id,actor_auth_id,canonico,datos,preparacion_sha256,parametros_revision,credencial_id,certificado_sha256,emisor_revision)
  VALUES(p_operacion_id,p_actor_auth_id,p_canonico,propuesta,p_sha,(contexto->>'revision_parametros')::integer,emisor.credencial_id,emisor.certificado_sha256,emisor.revision) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('operacion_id',p_operacion_id,'venta_id',venta.id,'preparacion_sha256',p_sha,'estado','DATOS_PREPARADOS','emision_habilitada',false);
END $$;
CREATE OR REPLACE FUNCTION public.persistir_preparacion_fiscal_homologacion(p_actor_auth_id uuid,p_operacion_id uuid,p_canonico text,p_sha text,p_ultimo_autorizado integer,p_consultado_en timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE binding jsonb; contexto jsonb; cuerpo jsonb; previa public.fiscal_preparaciones_homologacion%ROWTYPE;
BEGIN
 binding:=public.autorizar_consulta_fiscal_homologacion(p_actor_auth_id,p_operacion_id);
 SELECT * INTO previa FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=p_operacion_id;
 IF NOT FOUND OR previa.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR previa.credencial_id::text IS DISTINCT FROM binding->>'credencial_id'
  OR previa.certificado_sha256 IS DISTINCT FROM binding->>'certificado_sha256' OR previa.emisor_revision IS DISTINCT FROM (binding->>'revision')::integer THEN
  RAISE EXCEPTION 'La preparación no corresponde al actor/emisor vigente.' USING ERRCODE='42501'; END IF;
 contexto:=public.cargar_datos_preparacion_homologacion(p_actor_auth_id,(previa.datos->>'venta_id')::uuid);
 IF previa.parametros_revision IS DISTINCT FROM (contexto->>'revision_parametros')::integer THEN
  RAISE EXCEPTION 'Cambió la revisión de parámetros fiscales.' USING ERRCODE='40001'; END IF;
 cuerpo:=public.fiscal_validar_cuerpo_homologacion(p_operacion_id,p_canonico,p_sha);
 IF (cuerpo-'numero') IS DISTINCT FROM previa.datos->'datos' THEN
  RAISE EXCEPTION 'El cuerpo final difiere de los datos preparados.' USING ERRCODE='40001'; END IF;
 RETURN public.persistir_solicitud_fiscal_homologacion(p_operacion_id,p_canonico,p_sha,p_ultimo_autorizado,p_consultado_en);
END $$;
REVOKE ALL ON FUNCTION public.cargar_datos_preparacion_homologacion(uuid,uuid),public.guardar_datos_preparacion_homologacion(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_datos_preparacion_homologacion(uuid,uuid),public.guardar_datos_preparacion_homologacion(uuid,uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.persistir_preparacion_fiscal_homologacion(uuid,uuid,text,text,integer,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.persistir_preparacion_fiscal_homologacion(uuid,uuid,text,text,integer,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.resolver_preparacion_fiscal_homologacion(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resolver_preparacion_fiscal_homologacion(uuid,uuid) TO service_role;
COMMIT;
