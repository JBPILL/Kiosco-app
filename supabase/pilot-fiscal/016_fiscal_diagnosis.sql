-- Diagnóstico del Dueño, distinto de la auditoría histórica privada. Requiere 001–015.
-- Sólo lectura de registros existentes. Sin TA/red/permiso de reenvío.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_diagnostico_fiscal_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE; op public.fiscal_operaciones_homologacion%ROWTYPE;
 preparacion public.fiscal_preparaciones_homologacion%ROWTYPE; solicitud public.fiscal_solicitudes_homologacion%ROWTYPE;
 reserva public.fiscal_reservas_homologacion%ROWTYPE; respuesta public.fiscal_respuestas_emision_homologacion%ROWTYPE;
 consulta public.fiscal_reconciliaciones_homologacion%ROWTYPE; ultima jsonb;
BEGIN
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id
  AND venta_id=venta.id AND kiosco_id=venta.kiosco_id AND entorno='HOMOLOGACION' FOR UPDATE;
 IF NOT FOUND OR op.usuario_id IS DISTINCT FROM (SELECT id FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo) THEN
  RAISE EXCEPTION 'Diagnóstico fiscal no autorizado.' USING ERRCODE='42501'; END IF;
 SELECT * INTO preparacion FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=op.id;
 IF NOT FOUND OR preparacion.actor_auth_id IS DISTINCT FROM p_actor_auth_id THEN
  RAISE EXCEPTION 'Diagnóstico fiscal no autorizado.' USING ERRCODE='42501'; END IF;
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=op.id FOR SHARE;
 SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=op.id FOR SHARE;
 IF solicitud.operacion_id IS NULL OR reserva.estado IS NULL OR reserva.estado NOT IN ('RESERVADA','ENVIO_INCIERTO','AUTORIZADA')
  OR solicitud.solicitud_sha256 IS DISTINCT FROM reserva.solicitud_sha256
  OR solicitud.revision IS DISTINCT FROM (CASE WHEN reserva.estado='AUTORIZADA' THEN 2 ELSE 1 END)
  OR (solicitud.cuerpo-'numero') IS DISTINCT FROM preparacion.datos->'datos' THEN
  RAISE EXCEPTION 'Diagnóstico fiscal inconsistente.' USING ERRCODE='22023'; END IF;
 IF reserva.estado='AUTORIZADA' THEN PERFORM public.cargar_constancia_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id); END IF;
 SELECT * INTO respuesta FROM public.fiscal_respuestas_emision_homologacion WHERE operacion_id=op.id AND intento_id=reserva.intento_id;
 IF respuesta.operacion_id IS NOT NULL AND (respuesta.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR respuesta.solicitud_sha256 IS DISTINCT FROM solicitud.solicitud_sha256) THEN
  RAISE EXCEPTION 'Recepción fiscal inconsistente.' USING ERRCODE='22023'; END IF;
 SELECT * INTO consulta FROM public.fiscal_reconciliaciones_homologacion
 WHERE operacion_id=op.id AND intento_id=reserva.intento_id AND solicitud_sha256=solicitud.solicitud_sha256
 ORDER BY consultado_en DESC,id DESC LIMIT 1;
 IF consulta.id IS NOT NULL THEN
  ultima:=jsonb_build_object('estado',consulta.decision->>'estado',
   'codigo',CASE WHEN consulta.decision->>'estado'='CONCILIAR' THEN consulta.decision->>'codigo' ELSE NULL END);
 END IF;
 RETURN jsonb_build_object('version',1,'entorno','HOMOLOGACION','operacion_id',op.id,'venta_id',venta.id,
  'solicitud_sha256',solicitud.solicitud_sha256,'estado',reserva.estado,
  'recepcion',CASE WHEN respuesta.operacion_id IS NULL THEN NULL ELSE respuesta.respuesta END,'ultima_consulta',ultima,'puedeReenviar',false);
END $$;
REVOKE ALL ON FUNCTION public.cargar_diagnostico_fiscal_homologacion(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_diagnostico_fiscal_homologacion(uuid,uuid,uuid) TO service_role;
COMMIT;
