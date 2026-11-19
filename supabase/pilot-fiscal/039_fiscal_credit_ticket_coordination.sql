-- Coordinación TA por certificado compartida con facturas, propiedad NC separada.
-- Sólo sobres cifrados. Sin TA/claves planos, envío externo o instalación automática.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_nc_ta_vinculos_homologacion (
 intento_id uuid PRIMARY KEY REFERENCES public.fiscal_ta_intentos_homologacion(id),
 solicitud_id uuid NOT NULL REFERENCES public.fiscal_preparaciones_nc_homologacion(solicitud_id),
 actor_auth_id uuid NOT NULL, binding jsonb NOT NULL, creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.fiscal_nc_ta_vinculos_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_nc_ta_vinculos_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid='public.fiscal_nc_ta_vinculos_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.fiscal_nc_ta_vinculos_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_nc_ta_vinculos_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_nc_ta_vinculos_homologacion','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Privilegios heredados en vínculo TA NC.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_nc_ta_vinculo_inmutable ON public.fiscal_nc_ta_vinculos_homologacion;
CREATE TRIGGER fiscal_nc_ta_vinculo_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_nc_ta_vinculos_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();

-- Sólo recuperación/cancelación sin envío/confirmación de una respuesta ya recibida.
-- No sustituye038 para preparar o autorizar un envío WSAA nuevo.
CREATE OR REPLACE FUNCTION public.fiscal_binding_historico_ta_nc(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text,p_preparacion_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE prep jsonb; ctx jsonb; caso public.fiscal_nc_borradores_homologacion%ROWTYPE; op public.fiscal_operaciones_homologacion%ROWTYPE;
BEGIN
 prep:=public.cargar_preparacion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF prep IS NULL OR prep#>>'{preparacion,sha256}' IS DISTINCT FROM p_preparacion_sha THEN RAISE EXCEPTION 'Preparación TA NC distinta.' USING ERRCODE='42501'; END IF;
 SELECT * INTO caso FROM public.fiscal_nc_borradores_homologacion WHERE id=p_caso FOR SHARE;
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion;
 ctx:=prep->'contexto';
 RETURN jsonb_build_object('version',1,'entorno','HOMOLOGACION','servicio','wsfe','finalidad','NUMERACION_NC','venta_id',p_venta,'operacion_origen_id',p_operacion,
  'solicitud_id',p_caso,'propuesta_sha256',p_sha,'preparacion_sha256',p_preparacion_sha,'kiosco_id',op.kiosco_id,'usuario_id',op.usuario_id,'actor_auth_id',p_actor,
  'cuit_emisor',ctx->>'cuit_emisor','punto_venta',ctx->'punto_venta','tipo_comprobante',ctx->'tipo_nota_credito','credencial_id',caso.credencial_id,
  'certificado_sha256',caso.certificado_sha256,'revision_emisor',caso.emisor_revision,'revision_parametros',ctx->'revision_parametros','emision_habilitada',false);
END $$;
REVOKE ALL ON FUNCTION public.fiscal_binding_historico_ta_nc(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.coordinar_ta_nc_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text,p_preparacion_sha text,p_binding jsonb,p_accion text,p_intento uuid DEFAULT NULL,p_generacion bigint DEFAULT NULL,p_cifrado jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE binding jsonb; huella text; ta public.fiscal_ta_homologacion%ROWTYPE; intento public.fiscal_ta_intentos_homologacion%ROWTYPE;
 vinculo public.fiscal_nc_ta_vinculos_homologacion%ROWTYPE; siguiente bigint; instante timestamptz; expira timestamptz; ack jsonb;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador TA NC requerido.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'TA NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 IF p_accion IS NULL OR p_accion NOT IN ('SOLICITAR','INICIAR','CONFIRMAR','CANCELAR','ESTADO')
  OR (p_accion<>'ESTADO' AND p_intento IS NULL) OR (p_accion IN ('INICIAR','CONFIRMAR','CANCELAR') AND (p_generacion IS NULL OR p_generacion<1))
  OR (p_accion IN ('SOLICITAR','ESTADO') AND p_generacion IS NOT NULL) OR (p_accion='ESTADO' AND p_intento IS NOT NULL)
  OR (p_accion<>'CONFIRMAR' AND p_cifrado IS NOT NULL) THEN RAISE EXCEPTION 'Acción TA NC inválida.' USING ERRCODE='22023'; END IF;
 IF p_accion IN ('SOLICITAR','INICIAR') THEN
  binding:=public.cargar_fuente_numeracion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha,p_preparacion_sha)->'binding';
 ELSE binding:=public.fiscal_binding_historico_ta_nc(p_actor,p_venta,p_operacion,p_caso,p_sha,p_preparacion_sha); END IF;
 IF binding IS DISTINCT FROM p_binding THEN RAISE EXCEPTION 'Binding TA NC cambió.' USING ERRCODE='42501'; END IF;
 huella:=binding->>'certificado_sha256';
 IF p_accion='SOLICITAR' THEN INSERT INTO public.fiscal_ta_homologacion(certificado_sha256) VALUES(huella) ON CONFLICT DO NOTHING; END IF;
 SELECT * INTO ta FROM public.fiscal_ta_homologacion WHERE certificado_sha256=huella FOR UPDATE;
 IF p_accion IN ('SOLICITAR','INICIAR') AND (public.cargar_fuente_numeracion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha,p_preparacion_sha)->'binding') IS DISTINCT FROM binding THEN RAISE EXCEPTION 'Fuente TA NC cambió esperando.' USING ERRCODE='42501'; END IF;
 IF p_accion='ESTADO' THEN
  IF ta.certificado_sha256 IS NULL OR ta.estado='VACIO' THEN RETURN jsonb_build_object('estado','VACIO','intento_id',NULL,'revision',0); END IF;
  SELECT * INTO vinculo FROM public.fiscal_nc_ta_vinculos_homologacion WHERE intento_id=ta.intento_id;
  IF vinculo.binding IS DISTINCT FROM binding OR vinculo.actor_auth_id IS DISTINCT FROM p_actor OR vinculo.solicitud_id IS DISTINCT FROM p_caso THEN RETURN jsonb_build_object('estado','COMPARTIDA','intento_id',NULL,'revision',0); END IF;
  RETURN jsonb_build_object('estado',ta.estado,'intento_id',ta.intento_id,'revision',ta.revision);
 END IF;
 SELECT * INTO intento FROM public.fiscal_ta_intentos_homologacion WHERE id=p_intento FOR UPDATE;
 IF p_accion='SOLICITAR' THEN
  IF intento.id IS NOT NULL AND intento.certificado_sha256 IS DISTINCT FROM huella THEN RAISE EXCEPTION 'Intento TA reutilizado.' USING ERRCODE='22023'; END IF;
  IF ta.estado='DISPONIBLE' AND ta.vence_en>clock_timestamp() THEN
   IF ta.vence_en<=clock_timestamp()+interval '60 seconds' THEN RETURN jsonb_build_object('estado','ESPERAR_VENCIMIENTO','nuevo_intento',false); END IF;
   RETURN jsonb_build_object('estado','DISPONIBLE','nuevo_intento',false,'cifrado',ta.cifrado);
  END IF;
  IF ta.estado IN ('PREPARADA','ENVIO_INCIERTO') THEN RETURN jsonb_build_object('estado','RENOVACION_PENDIENTE','nuevo_intento',false); END IF;
  IF intento.id IS NOT NULL THEN RETURN jsonb_build_object('estado','INTENTO_OBSOLETO','nuevo_intento',false); END IF;
  siguiente:=ta.revision+1;
  -- Origen de factura NULL: las RPC008 no pueden adoptar/cancelar este intento NC.
  INSERT INTO public.fiscal_ta_intentos_homologacion(id,certificado_sha256,revision,operacion_origen_id) VALUES(p_intento,huella,siguiente,NULL);
  INSERT INTO public.fiscal_nc_ta_vinculos_homologacion(intento_id,solicitud_id,actor_auth_id,binding) VALUES(p_intento,p_caso,p_actor,binding);
  UPDATE public.fiscal_ta_homologacion SET revision=siguiente,estado='PREPARADA',intento_id=p_intento,cifrado=NULL,vence_en=NULL WHERE certificado_sha256=huella;
  RETURN jsonb_build_object('estado','RENOVAR','nuevo_intento',true,'intento_id',p_intento,'revision',siguiente);
 END IF;
 SELECT * INTO vinculo FROM public.fiscal_nc_ta_vinculos_homologacion WHERE intento_id=p_intento FOR SHARE;
 IF vinculo.binding IS DISTINCT FROM binding OR vinculo.actor_auth_id IS DISTINCT FROM p_actor OR vinculo.solicitud_id IS DISTINCT FROM p_caso
  OR intento.id IS NULL OR intento.operacion_origen_id IS NOT NULL OR intento.certificado_sha256 IS DISTINCT FROM huella OR intento.revision IS DISTINCT FROM p_generacion THEN RAISE EXCEPTION 'Intento TA NC ajeno.' USING ERRCODE='42501'; END IF;
 IF p_accion='CANCELAR' AND intento.cancelado_en IS NOT NULL THEN RETURN jsonb_build_object('estado','CANCELADA','intento_id',p_intento,'revision',p_generacion); END IF;
 IF ta.certificado_sha256 IS NULL OR ta.intento_id IS DISTINCT FROM p_intento OR ta.revision IS DISTINCT FROM p_generacion THEN RAISE EXCEPTION 'Generación TA cambió.' USING ERRCODE='40001'; END IF;
 IF p_accion='INICIAR' THEN
  IF intento.cancelado_en IS NOT NULL THEN RAISE EXCEPTION 'Intento TA cancelado.' USING ERRCODE='40001'; END IF;
  IF ta.estado IN ('ENVIO_INCIERTO','DISPONIBLE') AND intento.envio_iniciado_en IS NOT NULL THEN RETURN jsonb_build_object('estado',ta.estado,'nuevo_envio',false,'intento_id',p_intento,'revision',p_generacion); END IF;
  IF ta.estado<>'PREPARADA' OR intento.envio_iniciado_en IS NOT NULL THEN RAISE EXCEPTION 'TA NC no preparado.' USING ERRCODE='40001'; END IF;
  UPDATE public.fiscal_ta_intentos_homologacion SET envio_iniciado_en=clock_timestamp() WHERE id=p_intento;
  UPDATE public.fiscal_ta_homologacion SET estado='ENVIO_INCIERTO' WHERE certificado_sha256=huella;
  RETURN jsonb_build_object('estado','ENVIO_INCIERTO','nuevo_envio',true,'intento_id',p_intento,'revision',p_generacion);
 ELSIF p_accion='CANCELAR' THEN
  IF ta.estado<>'PREPARADA' OR intento.envio_iniciado_en IS NOT NULL OR intento.resultado IS NOT NULL THEN RAISE EXCEPTION 'Conservar incertidumbre de envío TA.' USING ERRCODE='40001'; END IF;
  UPDATE public.fiscal_ta_intentos_homologacion SET cancelado_en=clock_timestamp() WHERE id=p_intento;
  UPDATE public.fiscal_ta_homologacion SET estado='VACIO',intento_id=NULL,cifrado=NULL,vence_en=NULL WHERE certificado_sha256=huella;
  RETURN jsonb_build_object('estado','CANCELADA','intento_id',p_intento,'revision',p_generacion);
 END IF;
 PERFORM public.checkout_objeto(p_cifrado,ARRAY['version','keyId','nonce','ciphertext','expiresAt']);
 IF p_cifrado->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p_cifrado->'keyId') IS DISTINCT FROM 'string' OR p_cifrado->>'keyId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR jsonb_typeof(p_cifrado->'nonce') IS DISTINCT FROM 'string' OR p_cifrado->>'nonce' !~ '^[0-9a-f]{24}$'
  OR jsonb_typeof(p_cifrado->'ciphertext') IS DISTINCT FROM 'string' OR p_cifrado->>'ciphertext' !~ '^[0-9a-f]{32,}$' OR length(p_cifrado->>'ciphertext')>1100000 OR length(p_cifrado->>'ciphertext')%2<>0
  OR jsonb_typeof(p_cifrado->'expiresAt') IS DISTINCT FROM 'number' OR p_cifrado->>'expiresAt' !~ '^[0-9]{1,16}$' THEN RAISE EXCEPTION 'Sobre TA NC inválido.' USING ERRCODE='22023'; END IF;
 IF ta.estado='DISPONIBLE' THEN
  IF ta.cifrado IS DISTINCT FROM p_cifrado OR intento.resultado IS NULL THEN RAISE EXCEPTION 'TA ya confirmado distinto.' USING ERRCODE='22023'; END IF;
  RETURN intento.resultado;
 END IF;
 expira:=to_timestamp((p_cifrado->>'expiresAt')::numeric/1000);
 IF ta.estado<>'ENVIO_INCIERTO' OR intento.envio_iniciado_en IS NULL OR intento.cancelado_en IS NOT NULL OR NOT isfinite(expira) OR expira<=clock_timestamp() OR expira>clock_timestamp()+interval '12 hours 1 minute' THEN RAISE EXCEPTION 'Vigencia TA NC inválida.' USING ERRCODE='22023'; END IF;
 ack:=jsonb_build_object('estado','DISPONIBLE','intento_id',p_intento,'revision',p_generacion,'cifrado_sha256',encode(sha256(convert_to(p_cifrado::text,'UTF8')),'hex'));
 UPDATE public.fiscal_ta_homologacion SET estado='DISPONIBLE',cifrado=p_cifrado,vence_en=expira WHERE certificado_sha256=huella;
 UPDATE public.fiscal_ta_intentos_homologacion SET resultado=ack WHERE id=p_intento;
 RETURN ack;
END $$;
REVOKE ALL ON FUNCTION public.coordinar_ta_nc_homologacion(uuid,uuid,uuid,uuid,text,text,jsonb,text,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.coordinar_ta_nc_homologacion(uuid,uuid,uuid,uuid,text,text,jsonb,text,uuid,bigint,jsonb) TO service_role;
COMMIT;
