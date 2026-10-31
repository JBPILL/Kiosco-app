-- Observación fiscal histórica: sólo lectura, Auth original y misma venta.
-- Requiere familia 001–020 compatible; instalación remota con autorización.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_observacion_fiscal_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE; op public.fiscal_operaciones_homologacion%ROWTYPE;
 prep public.fiscal_preparaciones_homologacion%ROWTYPE; solicitud public.fiscal_solicitudes_homologacion%ROWTYPE;
 reserva public.fiscal_reservas_homologacion%ROWTYPE; observacion public.fiscal_reconciliaciones_homologacion%ROWTYPE;
 autorizado public.fiscal_autorizaciones_homologacion%ROWTYPE; esperado jsonb;
BEGIN
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 IF p_id IS NULL THEN RAISE EXCEPTION 'Identidad de observación inválida.' USING ERRCODE='22023'; END IF;
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id
  AND venta_id=venta.id AND kiosco_id=venta.kiosco_id AND entorno='HOMOLOGACION' FOR UPDATE;
 IF NOT FOUND OR op.usuario_id IS DISTINCT FROM (SELECT id FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo) THEN
  RAISE EXCEPTION 'Observación fiscal no autorizada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO prep FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=op.id;
 IF NOT FOUND OR prep.actor_auth_id IS DISTINCT FROM p_actor_auth_id THEN
  RAISE EXCEPTION 'Observación fiscal no autorizada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO observacion FROM public.fiscal_reconciliaciones_homologacion WHERE id=p_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF observacion.operacion_id IS DISTINCT FROM op.id THEN RAISE EXCEPTION 'Observación ajena.' USING ERRCODE='42501'; END IF;
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=op.id FOR SHARE;
 SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=op.id FOR SHARE;
 IF solicitud.operacion_id IS NULL OR reserva.operacion_id IS NULL
  OR observacion.intento_id IS DISTINCT FROM reserva.intento_id OR observacion.solicitud_sha256 IS DISTINCT FROM solicitud.solicitud_sha256
  OR reserva.solicitud_sha256 IS DISTINCT FROM solicitud.solicitud_sha256
  OR (solicitud.cuerpo-'numero') IS DISTINCT FROM prep.datos->'datos'
  OR (solicitud.cuerpo->>'numero')::integer IS DISTINCT FROM reserva.numero THEN
  RAISE EXCEPTION 'Observación fiscal incoherente.' USING ERRCODE='22023'; END IF;
 IF observacion.resultado->>'estado'='AUTORIZADA' THEN
  PERFORM public.cargar_constancia_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
  SELECT * INTO autorizado FROM public.fiscal_autorizaciones_homologacion WHERE operacion_id=op.id;
  esperado:=autorizado.resultado;
 ELSE
  esperado:=jsonb_build_object('version',1,'operacion_id',op.id,'numero',reserva.numero,'estado','PENDIENTE_CONCILIACION',
   'solicitud_sha256',solicitud.solicitud_sha256,'revision',1,'emision_habilitada',false);
 END IF;
 IF esperado IS NULL OR observacion.resultado IS DISTINCT FROM esperado THEN
  RAISE EXCEPTION 'Resultado histórico incoherente.' USING ERRCODE='22023'; END IF;
 RETURN esperado;
END $$;
REVOKE ALL ON FUNCTION public.cargar_observacion_fiscal_homologacion(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_observacion_fiscal_homologacion(uuid,uuid,uuid,uuid) TO service_role;
COMMIT;
