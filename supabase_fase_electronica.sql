BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS electronica_venta_tenant ON public.ventas(id,kiosco_id);
CREATE UNIQUE INDEX IF NOT EXISTS electronica_producto_tenant ON public.productos(id,kiosco_id);
CREATE UNIQUE INDEX IF NOT EXISTS electronica_detalle_identidad ON public.detalles_venta(id,venta_id,producto_id);
CREATE TABLE IF NOT EXISTS public.electronica_unidades (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
 detalle_venta_id uuid NOT NULL,venta_id uuid NOT NULL,producto_id uuid NOT NULL,
 tipo_identificador text NOT NULL CHECK(tipo_identificador IN ('SERIE','IMEI')),
 identificador text NOT NULL CHECK(length(identificador) BETWEEN 1 AND 80),
 garantia_hasta date,condiciones_garantia text,fecha_creacion timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kiosco_id,tipo_identificador,identificador),
 FOREIGN KEY(venta_id,kiosco_id) REFERENCES public.ventas(id,kiosco_id),
 FOREIGN KEY(producto_id,kiosco_id) REFERENCES public.productos(id,kiosco_id),
 FOREIGN KEY(detalle_venta_id,venta_id,producto_id) REFERENCES public.detalles_venta(id,venta_id,producto_id),
 CHECK((garantia_hasta IS NULL AND condiciones_garantia IS NULL) OR
 (garantia_hasta IS NOT NULL AND condiciones_garantia IS NOT NULL AND length(btrim(condiciones_garantia)) BETWEEN 1 AND 2000))
);
CREATE INDEX IF NOT EXISTS electronica_unidad_detalle ON public.electronica_unidades(detalle_venta_id);
CREATE TABLE IF NOT EXISTS public.electronica_reparaciones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
 fecha_ingreso timestamptz NOT NULL DEFAULT now(),cliente_nombre text NOT NULL CHECK(length(cliente_nombre) BETWEEN 1 AND 160),
 cliente_contacto text CHECK(length(cliente_contacto) BETWEEN 1 AND 120),equipo text NOT NULL CHECK(length(equipo) BETWEEN 1 AND 160),
 identificador text CHECK(length(identificador) BETWEEN 1 AND 80),informe_falla text NOT NULL CHECK(length(informe_falla) BETWEEN 1 AND 2000),
 diagnostico text CHECK(length(diagnostico) BETWEEN 1 AND 2000),
 estado text NOT NULL CHECK(estado IN ('RECIBIDA','DIAGNOSTICO','PRESUPUESTADA','AUTORIZADA','EN_REPARACION','LISTA','ENTREGADA','CANCELADA')),
 presupuesto numeric(12,2) CHECK(presupuesto BETWEEN 0 AND 9999999999.99),version integer NOT NULL CHECK(version>0)
);
CREATE INDEX IF NOT EXISTS electronica_reparaciones_tenant ON public.electronica_reparaciones(kiosco_id,fecha_ingreso);
CREATE TABLE IF NOT EXISTS public.electronica_solicitudes (
 kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),solicitud_id uuid NOT NULL,
 operacion text NOT NULL,payload jsonb NOT NULL,respuesta jsonb NOT NULL,
 PRIMARY KEY(kiosco_id,solicitud_id)
);
CREATE OR REPLACE FUNCTION public.electronica_kiosco_actual() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT u.kiosco_id FROM public.usuarios u JOIN public.kioscos k ON k.id=u.kiosco_id
 WHERE u.auth_user_id=auth.uid() AND u.activo AND u.rol='DUEÑO' AND k.rubro='ELECTRONICA_CELULARES'
 AND (SELECT count(*) FROM public.usuarios perfil WHERE perfil.auth_user_id=auth.uid() AND perfil.activo)=1;
$$;
REVOKE ALL ON FUNCTION public.electronica_kiosco_actual() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.electronica_kiosco_actual() TO authenticated;
-- Autorización bajo locks: cambiar perfil, rubro o suscripción espera la transacción.
CREATE OR REPLACE FUNCTION public.electronica_autorizar_escritura() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE perfil public.usuarios%ROWTYPE;comercio public.kioscos%ROWTYPE;
BEGIN
 BEGIN
  SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Electrónica requiere un único dueño activo del comercio';
 END;
 IF perfil.rol IS DISTINCT FROM 'DUEÑO' THEN RAISE EXCEPTION 'Electrónica requiere dueño activo del comercio'; END IF;
 SELECT * INTO comercio FROM public.kioscos WHERE id=perfil.kiosco_id FOR SHARE;
 IF NOT FOUND OR comercio.rubro IS DISTINCT FROM 'ELECTRONICA_CELULARES' THEN RAISE EXCEPTION 'Electrónica requiere dueño activo del comercio'; END IF;
 IF comercio.estado_suscripcion IS DISTINCT FROM 'ACTIVO' THEN RAISE EXCEPTION 'Comercio no habilitado para cambios'; END IF;
 RETURN comercio.id;
END;
$$;
REVOKE ALL ON FUNCTION public.electronica_autorizar_escritura() FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.electronica_unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electronica_reparaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electronica_solicitudes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.electronica_unidades,public.electronica_reparaciones,public.electronica_solicitudes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.electronica_unidades,public.electronica_reparaciones TO authenticated;
DROP POLICY IF EXISTS electronica_unidades_lectura ON public.electronica_unidades;
CREATE POLICY electronica_unidades_lectura ON public.electronica_unidades FOR SELECT TO authenticated USING(kiosco_id=public.electronica_kiosco_actual());
DROP POLICY IF EXISTS electronica_reparaciones_lectura ON public.electronica_reparaciones;
CREATE POLICY electronica_reparaciones_lectura ON public.electronica_reparaciones FOR SELECT TO authenticated USING(kiosco_id=public.electronica_kiosco_actual());
CREATE OR REPLACE VIEW public.v_electronica_unidades WITH(security_invoker=true) AS
 SELECT u.*,v.estado AS venta_estado,v.fecha_hora AS venta_fecha FROM public.electronica_unidades u JOIN public.ventas v ON v.id=u.venta_id AND v.kiosco_id=u.kiosco_id;
REVOKE ALL ON public.v_electronica_unidades FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.v_electronica_unidades TO authenticated;
CREATE OR REPLACE FUNCTION public.electronica_registrar_unidad(
 p_solicitud_id uuid,p_detalle_venta_id uuid,p_tipo text,p_identificador text,p_garantia_hasta date DEFAULT NULL,p_condiciones text DEFAULT NULL
) RETURNS public.electronica_unidades LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE kid uuid;ident text;condiciones text;payload jsonb;
 solicitud public.electronica_solicitudes%ROWTYPE;v public.ventas%ROWTYPE;d public.detalles_venta%ROWTYPE;p public.productos%ROWTYPE;
 unidad public.electronica_unidades%ROWTYPE;fecha date;digito integer;suma integer:=0;i integer;
BEGIN
 kid:=public.electronica_autorizar_escritura();
 IF kid IS NULL OR p_solicitud_id IS NULL THEN RAISE EXCEPTION 'Electrónica requiere dueño activo del comercio'; END IF;
 ident:=upper(btrim(p_identificador));condiciones:=nullif(btrim(p_condiciones),'');
 IF p_tipo IS NULL OR p_tipo NOT IN ('SERIE','IMEI') OR ident IS NULL OR length(ident)>80 OR ident !~ '^[A-Z0-9._/-]+$' THEN RAISE EXCEPTION 'Identificador inválido'; END IF;
 IF p_tipo='IMEI' THEN
  IF ident !~ '^[0-9]{15}$' THEN RAISE EXCEPTION 'IMEI inválido'; END IF;
  FOR i IN 1..15 LOOP
   digito:=substring(ident,i,1)::integer;
   IF i%2=0 THEN digito:=digito*2;IF digito>9 THEN digito:=digito-9;END IF;END IF;
   suma:=suma+digito;
  END LOOP;
  IF suma%10<>0 THEN RAISE EXCEPTION 'IMEI inválido'; END IF;
 END IF;
 IF (p_garantia_hasta IS NULL AND condiciones IS NOT NULL) OR (p_garantia_hasta IS NOT NULL AND condiciones IS NULL)
 OR length(condiciones)>2000 THEN RAISE EXCEPTION 'Condiciones de garantía inválidas'; END IF;
 payload:=jsonb_build_object('detalle',p_detalle_venta_id,'tipo',p_tipo,'identificador',ident,'hasta',p_garantia_hasta,'condiciones',condiciones);
 PERFORM pg_advisory_xact_lock(hashtextextended(kid::text||p_solicitud_id::text,0));
 SELECT * INTO solicitud FROM public.electronica_solicitudes WHERE kiosco_id=kid AND solicitud_id=p_solicitud_id;
 IF FOUND THEN
  IF solicitud.operacion<>'UNIDAD' OR solicitud.payload<>payload THEN RAISE EXCEPTION 'Solicitud reutilizada con otro contenido'; END IF;
  SELECT * INTO unidad FROM jsonb_populate_record(NULL::public.electronica_unidades,solicitud.respuesta);RETURN unidad;
 END IF;
 SELECT vv.* INTO v FROM public.ventas vv JOIN public.detalles_venta dd ON dd.venta_id=vv.id WHERE dd.id=p_detalle_venta_id AND vv.kiosco_id=kid FOR UPDATE OF vv;
 IF NOT FOUND OR v.estado<>'COMPLETADA' OR v.sincronizado IS DISTINCT FROM true THEN RAISE EXCEPTION 'Venta completada y sincronizada requerida'; END IF;
 SELECT * INTO d FROM public.detalles_venta WHERE id=p_detalle_venta_id AND venta_id=v.id FOR UPDATE;
 SELECT * INTO p FROM public.productos WHERE id=d.producto_id AND kiosco_id=kid;
 IF NOT FOUND OR coalesce(p.es_combo,false) OR coalesce(p.es_pesable,false)
 OR d.cantidad IS NULL OR d.cantidad<=0 OR d.cantidad<>trunc(d.cantidad) THEN RAISE EXCEPTION 'Detalle no admite unidades'; END IF;
 fecha:=(v.fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
 IF p_garantia_hasta IS NOT NULL AND (p_garantia_hasta<fecha OR p_garantia_hasta>(fecha+interval '10 years')::date) THEN RAISE EXCEPTION 'Fecha de garantía inválida'; END IF;
 IF (SELECT count(*) FROM public.electronica_unidades WHERE detalle_venta_id=d.id)>=d.cantidad THEN RAISE EXCEPTION 'Cantidad de unidades agotada'; END IF;
 INSERT INTO public.electronica_unidades(kiosco_id,detalle_venta_id,venta_id,producto_id,tipo_identificador,identificador,garantia_hasta,condiciones_garantia)
 VALUES(kid,d.id,v.id,d.producto_id,p_tipo,ident,p_garantia_hasta,condiciones) RETURNING * INTO unidad;
 INSERT INTO public.electronica_solicitudes VALUES(kid,p_solicitud_id,'UNIDAD',payload,to_jsonb(unidad));RETURN unidad;
END;
$$;
REVOKE ALL ON FUNCTION public.electronica_registrar_unidad(uuid,uuid,text,text,date,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.electronica_registrar_unidad(uuid,uuid,text,text,date,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.electronica_guardar_reparacion(p_solicitud_id uuid,p_reparacion_id uuid,p_version integer,p_datos jsonb)
RETURNS public.electronica_reparaciones LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE kid uuid;datos jsonb;payload jsonb;solicitud public.electronica_solicitudes%ROWTYPE;
 actual public.electronica_reparaciones%ROWTYPE;nueva public.electronica_reparaciones%ROWTYPE;v_estado text;v_presupuesto numeric;
BEGIN
 kid:=public.electronica_autorizar_escritura();
 IF kid IS NULL OR p_solicitud_id IS NULL THEN RAISE EXCEPTION 'Electrónica requiere dueño activo del comercio'; END IF;
 IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR octet_length(p_datos::text)>16384 THEN RAISE EXCEPTION 'Datos de reparación inválidos'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_datos) campo WHERE campo NOT IN ('cliente_nombre','cliente_contacto','equipo','identificador','informe_falla','diagnostico','estado','presupuesto'))
 OR EXISTS(SELECT 1 FROM jsonb_each(p_datos) e WHERE e.key<>'presupuesto' AND jsonb_typeof(e.value) NOT IN ('string','null')) THEN RAISE EXCEPTION 'Campos de reparación inválidos'; END IF;
 datos:=jsonb_build_object('cliente_nombre',nullif(btrim(p_datos->>'cliente_nombre'),''),'cliente_contacto',nullif(btrim(p_datos->>'cliente_contacto'),''),
 'equipo',nullif(btrim(p_datos->>'equipo'),''),'identificador',nullif(btrim(p_datos->>'identificador'),''),'informe_falla',nullif(btrim(p_datos->>'informe_falla'),''),
 'diagnostico',nullif(btrim(p_datos->>'diagnostico'),''),'estado',p_datos->>'estado','presupuesto',p_datos->'presupuesto');
 v_estado:=datos->>'estado';
 IF datos->>'cliente_nombre' IS NULL OR length(datos->>'cliente_nombre')>160 OR datos->>'equipo' IS NULL OR length(datos->>'equipo')>160
 OR datos->>'informe_falla' IS NULL OR length(datos->>'informe_falla')>2000 OR length(datos->>'cliente_contacto')>120
 OR length(datos->>'identificador')>80 OR length(datos->>'diagnostico')>2000 OR v_estado IS NULL
 OR v_estado NOT IN ('RECIBIDA','DIAGNOSTICO','PRESUPUESTADA','AUTORIZADA','EN_REPARACION','LISTA','ENTREGADA','CANCELADA') THEN RAISE EXCEPTION 'Datos de reparación inválidos'; END IF;
 IF datos->'presupuesto' IS NOT NULL AND datos->'presupuesto'<>'null'::jsonb THEN
  IF jsonb_typeof(datos->'presupuesto')<>'number' THEN RAISE EXCEPTION 'Presupuesto inválido'; END IF;
  v_presupuesto:=(datos->>'presupuesto')::numeric;
  IF v_presupuesto<0 OR v_presupuesto>9999999999.99 OR v_presupuesto<>round(v_presupuesto,2) THEN RAISE EXCEPTION 'Presupuesto inválido'; END IF;
 END IF;
 payload:=jsonb_build_object('id',p_reparacion_id,'version',p_version,'datos',datos);
 PERFORM pg_advisory_xact_lock(hashtextextended(kid::text||p_solicitud_id::text,0));
 SELECT * INTO solicitud FROM public.electronica_solicitudes WHERE kiosco_id=kid AND solicitud_id=p_solicitud_id;
 IF FOUND THEN
  IF solicitud.operacion<>'REPARACION' OR solicitud.payload<>payload THEN RAISE EXCEPTION 'Solicitud reutilizada con otro contenido'; END IF;
  SELECT * INTO nueva FROM jsonb_populate_record(NULL::public.electronica_reparaciones,solicitud.respuesta);RETURN nueva;
 END IF;
 IF p_reparacion_id IS NULL THEN
  IF p_version IS NOT NULL OR v_estado<>'RECIBIDA' THEN RAISE EXCEPTION 'La reparación debe ingresar RECIBIDA'; END IF;
  INSERT INTO public.electronica_reparaciones(kiosco_id,cliente_nombre,cliente_contacto,equipo,identificador,informe_falla,diagnostico,estado,presupuesto,version)
  VALUES(kid,datos->>'cliente_nombre',datos->>'cliente_contacto',datos->>'equipo',datos->>'identificador',datos->>'informe_falla',datos->>'diagnostico',v_estado,v_presupuesto,1) RETURNING * INTO nueva;
 ELSE
  SELECT * INTO actual FROM public.electronica_reparaciones WHERE id=p_reparacion_id AND kiosco_id=kid FOR UPDATE;
  IF NOT FOUND OR p_version IS DISTINCT FROM actual.version THEN RAISE EXCEPTION 'Versión de reparación desactualizada'; END IF;
  IF actual.estado IN ('ENTREGADA','CANCELADA') THEN RAISE EXCEPTION 'Reparación terminada no editable'; END IF;
  IF v_estado<>actual.estado AND NOT (
   (actual.estado='RECIBIDA' AND v_estado IN ('DIAGNOSTICO','CANCELADA')) OR
   (actual.estado='DIAGNOSTICO' AND v_estado IN ('PRESUPUESTADA','CANCELADA')) OR
   (actual.estado='PRESUPUESTADA' AND v_estado IN ('AUTORIZADA','DIAGNOSTICO','CANCELADA')) OR
   (actual.estado='AUTORIZADA' AND v_estado IN ('EN_REPARACION','CANCELADA')) OR
   (actual.estado='EN_REPARACION' AND v_estado IN ('LISTA','CANCELADA')) OR
   (actual.estado='LISTA' AND v_estado IN ('ENTREGADA','EN_REPARACION'))) THEN RAISE EXCEPTION 'Transición de reparación inválida'; END IF;
  UPDATE public.electronica_reparaciones SET cliente_nombre=datos->>'cliente_nombre',cliente_contacto=datos->>'cliente_contacto',equipo=datos->>'equipo',
   identificador=datos->>'identificador',informe_falla=datos->>'informe_falla',diagnostico=datos->>'diagnostico',estado=v_estado,
   presupuesto=v_presupuesto,version=actual.version+1 WHERE id=actual.id RETURNING * INTO nueva;
 END IF;
 INSERT INTO public.electronica_solicitudes VALUES(kid,p_solicitud_id,'REPARACION',payload,to_jsonb(nueva));RETURN nueva;
END;
$$;
REVOKE ALL ON FUNCTION public.electronica_guardar_reparacion(uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.electronica_guardar_reparacion(uuid,uuid,integer,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
