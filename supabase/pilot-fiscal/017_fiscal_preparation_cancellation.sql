-- Cancelación sólo antes de cuerpo/número. Requiere 001–016. No elimina historia.
-- Usar también las funciones actualizadas de 001,002,012 de esta revisión;
-- no instalar 017 aislado sobre versiones anteriores de esos archivos.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_cancelaciones_preparacion_homologacion (
 operacion_id uuid PRIMARY KEY,
 venta_id uuid NOT NULL REFERENCES public.ventas(id),
 kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
 usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
 actor_auth_id uuid NOT NULL,
 origen_estado text NOT NULL CHECK(origen_estado IN ('SIN_GUARDADO','DATOS_PREPARADOS')),
 preparacion_sha256 text CHECK(preparacion_sha256 ~ '^[0-9a-f]{64}$'),
 cancelado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((origen_estado='SIN_GUARDADO' AND preparacion_sha256 IS NULL) OR (origen_estado='DATOS_PREPARADOS' AND preparacion_sha256 IS NOT NULL))
);
ALTER TABLE public.fiscal_cancelaciones_preparacion_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_cancelaciones_preparacion_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; restriccion record; BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
 WHERE attrelid='public.fiscal_cancelaciones_preparacion_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT (%s),INSERT (%s),UPDATE (%s),REFERENCES (%s) ON public.fiscal_cancelaciones_preparacion_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_cancelaciones_preparacion_homologacion','SELECT,INSERT,UPDATE,DELETE')
   OR has_any_column_privilege(rol,'public.fiscal_cancelaciones_preparacion_homologacion','SELECT,INSERT,UPDATE') THEN
   RAISE EXCEPTION 'Privilegios heredados en cancelación fiscal.'; END IF;
 END LOOP;
 FOR restriccion IN SELECT conname FROM pg_constraint WHERE conrelid='public.fiscal_operaciones_homologacion'::regclass
  AND ((contype='u' AND pg_get_constraintdef(oid)='UNIQUE (kiosco_id, venta_id, entorno)')
   OR (contype='c' AND conname IN ('fiscal_operaciones_homologacion_estado_check','fiscal_operacion_estado_lifecycle'))) LOOP
  EXECUTE format('ALTER TABLE public.fiscal_operaciones_homologacion DROP CONSTRAINT %I',restriccion.conname);
 END LOOP;
END $$;
ALTER TABLE public.fiscal_operaciones_homologacion ADD CONSTRAINT fiscal_operacion_estado_lifecycle CHECK(estado IN ('PREPARADA','CANCELADA'));
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_operacion_activa_venta ON public.fiscal_operaciones_homologacion(kiosco_id,venta_id,entorno) WHERE estado='PREPARADA';

CREATE OR REPLACE FUNCTION public.fiscal_cancelacion_preparacion_inmutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 RAISE EXCEPTION 'La cancelación fiscal conserva su auditoría inmutable.' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION public.fiscal_cancelacion_preparacion_inmutable() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_cancelacion_preparacion_inmutable ON public.fiscal_cancelaciones_preparacion_homologacion;
CREATE TRIGGER fiscal_cancelacion_preparacion_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_cancelaciones_preparacion_homologacion
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_cancelacion_preparacion_inmutable();

CREATE OR REPLACE FUNCTION public.fiscal_operacion_conservar_cancelacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cancelacion public.fiscal_cancelaciones_preparacion_homologacion%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'La operación fiscal conserva su historial.' USING ERRCODE='55000'; END IF;
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:operation:'||NEW.id::text,0));
  SELECT * INTO cancelacion FROM public.fiscal_cancelaciones_preparacion_homologacion WHERE operacion_id=NEW.id;
  IF NEW.estado IS DISTINCT FROM 'PREPARADA' OR cancelacion.operacion_id IS NOT NULL THEN
   RAISE EXCEPTION 'Identidad fiscal cancelada; no reactivar.' USING ERRCODE='55000'; END IF;
 ELSE
  SELECT * INTO cancelacion FROM public.fiscal_cancelaciones_preparacion_homologacion WHERE operacion_id=NEW.id;
  IF (to_jsonb(NEW)-'estado') IS DISTINCT FROM (to_jsonb(OLD)-'estado') THEN
   RAISE EXCEPTION 'La operación fiscal conserva sus datos originales.' USING ERRCODE='55000'; END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND (OLD.estado IS DISTINCT FROM 'PREPARADA' OR NEW.estado IS DISTINCT FROM 'CANCELADA'
   OR cancelacion.operacion_id IS NULL OR cancelacion.venta_id IS DISTINCT FROM OLD.venta_id OR cancelacion.kiosco_id IS DISTINCT FROM OLD.kiosco_id
   OR cancelacion.usuario_id IS DISTINCT FROM OLD.usuario_id OR cancelacion.origen_estado IS DISTINCT FROM 'DATOS_PREPARADOS'
   OR NOT EXISTS(SELECT 1 FROM public.fiscal_preparaciones_homologacion p WHERE p.operacion_id=OLD.id AND p.actor_auth_id=cancelacion.actor_auth_id AND p.preparacion_sha256=cancelacion.preparacion_sha256)
   OR EXISTS(SELECT 1 FROM public.fiscal_reservas_homologacion WHERE operacion_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=OLD.id)) THEN
   RAISE EXCEPTION 'Transición fiscal no autorizada.' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_operacion_conservar_cancelacion() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_operacion_conservar_cancelacion ON public.fiscal_operaciones_homologacion;
CREATE TRIGGER fiscal_operacion_conservar_cancelacion BEFORE INSERT OR UPDATE OR DELETE ON public.fiscal_operaciones_homologacion
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_operacion_conservar_cancelacion();

CREATE OR REPLACE FUNCTION public.consultar_cancelacion_preparacion_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE; cancelacion public.fiscal_cancelaciones_preparacion_homologacion%ROWTYPE;
BEGIN
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 SELECT * INTO cancelacion FROM public.fiscal_cancelaciones_preparacion_homologacion WHERE operacion_id=p_operacion_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF cancelacion.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR cancelacion.venta_id IS DISTINCT FROM venta.id OR cancelacion.kiosco_id IS DISTINCT FROM venta.kiosco_id
  OR cancelacion.usuario_id IS DISTINCT FROM (SELECT id FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo) THEN
  RAISE EXCEPTION 'Cancelación fiscal no autorizada.' USING ERRCODE='42501'; END IF;
 IF (cancelacion.origen_estado='SIN_GUARDADO' AND EXISTS(SELECT 1 FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id))
  OR (cancelacion.origen_estado='DATOS_PREPARADOS' AND NOT EXISTS(SELECT 1 FROM public.fiscal_operaciones_homologacion o
   JOIN public.fiscal_preparaciones_homologacion p ON p.operacion_id=o.id WHERE o.id=p_operacion_id AND o.estado='CANCELADA'
    AND o.venta_id=venta.id AND o.kiosco_id=venta.kiosco_id AND o.usuario_id=cancelacion.usuario_id
    AND p.actor_auth_id=p_actor_auth_id AND p.preparacion_sha256=cancelacion.preparacion_sha256))
  OR EXISTS(SELECT 1 FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id)
  OR EXISTS(SELECT 1 FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id) THEN
  RAISE EXCEPTION 'No se confirmó cancelación fiscal coherente.' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('operacion_id',p_operacion_id,'venta_id',venta.id,'estado','CANCELADA','emision_habilitada',false);
END $$;

CREATE OR REPLACE FUNCTION public.cancelar_preparacion_fiscal_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE; op public.fiscal_operaciones_homologacion%ROWTYPE;
 previa public.fiscal_preparaciones_homologacion%ROWTYPE; anterior jsonb; origen text;
BEGIN
 IF p_operacion_id IS NULL THEN RAISE EXCEPTION 'Identidad de cancelación inválida.' USING ERRCODE='22023'; END IF;
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:operation:'||p_operacion_id::text,0));
 anterior:=public.consultar_cancelacion_preparacion_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
 IF anterior IS NOT NULL THEN RETURN anterior; END IF;
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id FOR UPDATE;
 IF op.id IS NOT NULL THEN
  SELECT * INTO previa FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=op.id;
  IF op.venta_id IS DISTINCT FROM venta.id OR op.kiosco_id IS DISTINCT FROM venta.kiosco_id OR op.estado IS DISTINCT FROM 'PREPARADA'
   OR op.usuario_id IS DISTINCT FROM (SELECT id FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo)
   OR previa.operacion_id IS NULL OR previa.actor_auth_id IS DISTINCT FROM p_actor_auth_id THEN
   RAISE EXCEPTION 'Cancelación fiscal no autorizada.' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.fiscal_reservas_homologacion WHERE operacion_id=op.id)
   OR EXISTS(SELECT 1 FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=op.id) THEN
   RAISE EXCEPTION 'Ya existe cuerpo o numeración fiscal; requiere otra resolución.' USING ERRCODE='55000'; END IF;
  origen:='DATOS_PREPARADOS';
 ELSE origen:='SIN_GUARDADO';
 END IF;
 INSERT INTO public.fiscal_cancelaciones_preparacion_homologacion(operacion_id,venta_id,kiosco_id,usuario_id,actor_auth_id,origen_estado,preparacion_sha256)
  VALUES(p_operacion_id,venta.id,venta.kiosco_id,(SELECT id FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo),p_actor_auth_id,origen,previa.preparacion_sha256);
 IF op.id IS NOT NULL THEN
  UPDATE public.fiscal_operaciones_homologacion SET estado='CANCELADA' WHERE id=op.id AND estado='PREPARADA' RETURNING * INTO op;
  IF op.estado IS DISTINCT FROM 'CANCELADA' THEN RAISE EXCEPTION 'No se confirmó cancelación fiscal.' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN public.consultar_cancelacion_preparacion_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
END $$;
REVOKE ALL ON FUNCTION public.consultar_cancelacion_preparacion_homologacion(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.cancelar_preparacion_fiscal_homologacion(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_cancelacion_preparacion_homologacion(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_preparacion_fiscal_homologacion(uuid,uuid,uuid) TO service_role;
COMMIT;
