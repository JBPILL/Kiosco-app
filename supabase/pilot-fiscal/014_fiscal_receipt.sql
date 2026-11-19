-- Constancia durable de homologación. Requiere 001–013. Sin emisión ni provisión.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_constancia_fiscal_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE; op public.fiscal_operaciones_homologacion%ROWTYPE;
 preparacion public.fiscal_preparaciones_homologacion%ROWTYPE;
 solicitud public.fiscal_solicitudes_homologacion%ROWTYPE;
 reserva public.fiscal_reservas_homologacion%ROWTYPE;
 autorizacion public.fiscal_autorizaciones_homologacion%ROWTYPE; esperado jsonb;
BEGIN
 -- Mismo orden perfil → comercio → venta → operación. No necesita emisor/TA vigentes.
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id
  AND venta_id=venta.id AND kiosco_id=venta.kiosco_id AND entorno='HOMOLOGACION' FOR UPDATE;
 IF NOT FOUND OR op.usuario_id IS DISTINCT FROM (SELECT id FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo) THEN
  RAISE EXCEPTION 'Constancia fiscal no autorizada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO preparacion FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=op.id;
 IF NOT FOUND OR preparacion.actor_auth_id IS DISTINCT FROM p_actor_auth_id THEN
  RAISE EXCEPTION 'Constancia fiscal no autorizada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=op.id FOR SHARE;
 SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=op.id FOR SHARE;
 SELECT * INTO autorizacion FROM public.fiscal_autorizaciones_homologacion WHERE operacion_id=op.id FOR SHARE;
 IF solicitud.operacion_id IS NULL OR reserva.estado IS DISTINCT FROM 'AUTORIZADA' OR solicitud.revision IS DISTINCT FROM 2
  OR autorizacion.operacion_id IS NULL OR autorizacion.intento_id IS DISTINCT FROM reserva.intento_id
  OR autorizacion.solicitud_sha256 IS DISTINCT FROM solicitud.solicitud_sha256
  OR reserva.solicitud_sha256 IS DISTINCT FROM solicitud.solicitud_sha256
  OR (solicitud.cuerpo-'numero') IS DISTINCT FROM preparacion.datos->'datos'
  OR solicitud.cuerpo->>'cuitEmisor' IS DISTINCT FROM reserva.cuit_emisor
  OR (solicitud.cuerpo->>'puntoVenta')::integer IS DISTINCT FROM reserva.punto_venta
  OR (solicitud.cuerpo->>'tipoComprobante')::integer IS DISTINCT FROM reserva.tipo_comprobante
  OR (solicitud.cuerpo->>'numero')::integer IS DISTINCT FROM reserva.numero THEN
  RAISE EXCEPTION 'Falta constancia fiscal durable coherente.' USING ERRCODE='22023'; END IF;
 esperado:=jsonb_build_object('version',1,'operacion_id',op.id,'numero',reserva.numero,'estado','AUTORIZADA',
  'solicitud_sha256',solicitud.solicitud_sha256,'revision',2,'emision_habilitada',false,
  'cae',autorizacion.cae,'vencimiento',autorizacion.vencimiento,'procesado_en',autorizacion.procesado_en);
 IF autorizacion.resultado IS DISTINCT FROM esperado THEN
  RAISE EXCEPTION 'Constancia fiscal inconsistente.' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('version',1,'entorno','HOMOLOGACION','estado','AUTORIZADA','operacion_id',op.id,'venta_id',venta.id,
  'solicitud',jsonb_build_object('version',1,'solicitud',solicitud.cuerpo,'sha256',solicitud.solicitud_sha256),
  'autorizacion',jsonb_build_object('cae',autorizacion.cae,'vencimiento',autorizacion.vencimiento,'procesado_en',autorizacion.procesado_en));
END $$;
REVOKE ALL ON FUNCTION public.cargar_constancia_fiscal_homologacion(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_constancia_fiscal_homologacion(uuid,uuid,uuid) TO service_role;
COMMIT;
