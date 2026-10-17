-- Optional canonical commercial module. Apply AFTER 900_final_security.sql.
-- Incremental counterpart: supabase_fase_comercial_suscripciones.sql (byte-identical).
-- No remote installation is authorized by this source file.
BEGIN;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.kioscos ADD COLUMN IF NOT EXISTS direccion text;
ALTER TABLE public.kioscos ADD COLUMN IF NOT EXISTS telefono text;
ALTER TABLE public.kioscos ADD COLUMN IF NOT EXISTS rubro text NOT NULL DEFAULT 'KIOSCO';

CREATE TABLE IF NOT EXISTS public.planes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL,
  precio_mensual numeric(12,2) NOT NULL CHECK (precio_mensual>=0),
  max_usuarios integer NOT NULL CHECK (max_usuarios BETWEEN 1 AND 100),
  descripcion text, activo boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.suscripciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  plan_id uuid NOT NULL REFERENCES public.planes(id),
  fecha_inicio date NOT NULL, fecha_vencimiento date NOT NULL,
  estado text NOT NULL CHECK (estado IN ('ACTIVA','VENCIDA','SUSPENDIDA','CANCELADA')),
  CHECK (fecha_vencimiento>=fecha_inicio)
);
-- Fail closed on ambiguous existing subscriptions; never silently choose/delete one.
CREATE UNIQUE INDEX IF NOT EXISTS suscripcion_comercial_vigente_idx
  ON public.suscripciones(kiosco_id) WHERE estado<>'CANCELADA';
CREATE TABLE IF NOT EXISTS public.pagos_suscripcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscripcion_id uuid NOT NULL REFERENCES public.suscripciones(id),
  monto numeric(12,2) NOT NULL CHECK (monto>=0),
  fecha_pago timestamptz NOT NULL DEFAULT now(), medio_pago text,
  comprobante text, notas text
);
ALTER TABLE public.pagos_suscripcion ADD COLUMN IF NOT EXISTS operacion_id uuid;
ALTER TABLE public.pagos_suscripcion ADD COLUMN IF NOT EXISTS actor_usuario_id uuid REFERENCES public.usuarios(id);
ALTER TABLE public.pagos_suscripcion ADD COLUMN IF NOT EXISTS meses integer;
CREATE UNIQUE INDEX IF NOT EXISTS pago_comercial_operacion_idx
  ON public.pagos_suscripcion(operacion_id) WHERE operacion_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.configuracion_admin (
  id text PRIMARY KEY DEFAULT 'general', whatsapp text NOT NULL DEFAULT '',
  alias_mp text NOT NULL DEFAULT '', cbu_banco text NOT NULL DEFAULT '',
  titular_cuenta text NOT NULL DEFAULT '', banco_nombre text NOT NULL DEFAULT '',
  mensaje_soporte text NOT NULL DEFAULT '', fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.operaciones_comerciales (
  id uuid PRIMARY KEY, actor_usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  kiosco_id uuid REFERENCES public.kioscos(id), tipo text NOT NULL,
  solicitud jsonb NOT NULL, resultado jsonb, creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.auditoria_comercial_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacion_id uuid NOT NULL REFERENCES public.operaciones_comerciales(id),
  actor_usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  kiosco_id uuid REFERENCES public.kioscos(id), tipo text NOT NULL,
  estado_anterior jsonb, estado_nuevo jsonb, datos jsonb NOT NULL DEFAULT '{}',
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operacion_id,tipo)
);

CREATE OR REPLACE FUNCTION public.comercial_hoy()
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$ SELECT (statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date $$;

CREATE OR REPLACE FUNCTION public.comercial_actor(p_solo_admin boolean DEFAULT true)
RETURNS public.usuarios LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a public.usuarios%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo;
  IF a.id IS NULL OR (p_solo_admin AND NOT a.es_superadmin)
    OR (NOT p_solo_admin AND NOT a.es_superadmin AND a.rol<>'DUEÑO') THEN
    RAISE EXCEPTION 'Administración comercial no autorizada' USING ERRCODE='42501';
  END IF;
  RETURN a;
END $$;

CREATE OR REPLACE FUNCTION public.comercial_resolver_estado(p_decision text,p_estado text,p_vencimiento date,p_hoy date)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
  SELECT CASE WHEN p_decision='SUSPENDIDO' OR p_estado='SUSPENDIDA' THEN 'SUSPENDIDO'
    WHEN p_decision IS DISTINCT FROM 'ACTIVO' OR p_estado IS DISTINCT FROM 'ACTIVA'
      OR p_vencimiento IS NULL OR p_vencimiento<p_hoy THEN 'SOLO_LECTURA'
    ELSE 'ACTIVO' END
$$;
CREATE OR REPLACE FUNCTION public.estado_comercial_efectivo(p_kiosco_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
  SELECT public.comercial_resolver_estado(k.estado_suscripcion,s.estado,s.fecha_vencimiento,public.comercial_hoy())
  FROM public.kioscos k LEFT JOIN public.suscripciones s
    ON s.kiosco_id=k.id AND s.estado<>'CANCELADA' WHERE k.id=p_kiosco_id
$$;

CREATE OR REPLACE FUNCTION public.comercial_mutar(p_operacion_id uuid,p_tipo text,p_kiosco_id uuid,p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a public.usuarios; op public.operaciones_comerciales%ROWTYPE;
  k public.kioscos%ROWTYPE; s public.suscripciones%ROWTYPE; pl public.planes%ROWTYPE;
  req jsonb; anterior jsonb; nuevo jsonb; salida jsonb; evento text; fecha date;
  meses integer; monto numeric; v_estado text; pid uuid; pago uuid; uid uuid;
BEGIN
  a:=public.comercial_actor(true);
  IF p_operacion_id IS NULL OR coalesce(jsonb_typeof(p_datos),'')<>'object' THEN
    RAISE EXCEPTION 'Solicitud comercial inválida' USING ERRCODE='22023';
  END IF;
  IF (p_tipo IN ('RENOVACION','CAMBIO_ESTADO','CAMBIO_PLAN','EDITAR_COMERCIO') AND p_kiosco_id IS NULL)
    OR (p_tipo IN ('MODIFICACION_PLAN','CONFIGURACION') AND p_kiosco_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Destino comercial inválido' USING ERRCODE='22023';
  END IF;
  req:=jsonb_build_object('kiosco_id',p_kiosco_id,'datos',p_datos);
  INSERT INTO public.operaciones_comerciales(id,actor_usuario_id,kiosco_id,tipo,solicitud)
    VALUES(p_operacion_id,a.id,p_kiosco_id,p_tipo,req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_comerciales WHERE id=p_operacion_id FOR UPDATE;
  IF op.actor_usuario_id<>a.id OR op.tipo<>p_tipo OR op.kiosco_id IS DISTINCT FROM p_kiosco_id
    OR op.solicitud<>req THEN
    RAISE EXCEPTION 'Operation ID asociado a otra solicitud' USING ERRCODE='22023';
  END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  IF p_kiosco_id IS NOT NULL THEN
    SELECT * INTO k FROM public.kioscos WHERE id=p_kiosco_id FOR UPDATE;
    IF k.id IS NULL THEN RAISE EXCEPTION 'Comercio no encontrado' USING ERRCODE='22023'; END IF;
    SELECT * INTO s FROM public.suscripciones WHERE kiosco_id=k.id AND estado<>'CANCELADA' FOR UPDATE;
    anterior:=jsonb_build_object('kiosco',to_jsonb(k),'suscripcion',to_jsonb(s));
  END IF;

  IF p_tipo='RENOVACION' THEN
    meses:=(p_datos->>'meses')::integer; monto:=(p_datos->>'monto')::numeric;
    IF s.id IS NULL OR meses IS NULL OR meses NOT BETWEEN 1 AND 12 OR monto IS NULL
      OR monto<0 OR monto::text IN ('NaN','Infinity','-Infinity') OR monto<>round(monto,2)
      OR monto>9999999999.99 OR coalesce(p_datos->>'medio_pago','') NOT IN ('TRANSFERENCIA','MERCADOPAGO','EFECTIVO','OTRO')
      OR length(coalesce(p_datos->>'notas',''))>1000 THEN
      RAISE EXCEPTION 'Renovación inválida o suscripción no disponible' USING ERRCODE='22023';
    END IF;
    fecha:=(greatest(s.fecha_vencimiento,public.comercial_hoy())+make_interval(months=>meses))::date;
    v_estado:=CASE WHEN k.estado_suscripcion='SUSPENDIDO' THEN 'SUSPENDIDO' ELSE 'ACTIVO' END;
    UPDATE public.suscripciones SET fecha_vencimiento=fecha,
      estado=CASE WHEN v_estado='SUSPENDIDO' THEN 'SUSPENDIDA' ELSE 'ACTIVA' END WHERE id=s.id;
    UPDATE public.kioscos SET estado_suscripcion=v_estado WHERE id=k.id;
    INSERT INTO public.pagos_suscripcion(suscripcion_id,monto,medio_pago,notas,operacion_id,actor_usuario_id,meses)
      VALUES(s.id,monto,p_datos->>'medio_pago',nullif(p_datos->>'notas',''),p_operacion_id,a.id,meses) RETURNING id INTO pago;
    salida:=jsonb_build_object('success',true,'suscripcion_id',s.id,'fecha_vencimiento',fecha,'pago_id',pago,'estado',v_estado);
    evento:='RENOVACION';
  ELSIF p_tipo='CAMBIO_ESTADO' THEN
    v_estado:=p_datos->>'estado';
    IF v_estado IS NULL OR v_estado NOT IN ('ACTIVO','SOLO_LECTURA','SUSPENDIDO') THEN
      RAISE EXCEPTION 'Estado comercial inválido' USING ERRCODE='22023';
    END IF;
    IF v_estado='ACTIVO' AND (s.id IS NULL OR s.fecha_vencimiento<public.comercial_hoy()) THEN
      RAISE EXCEPTION 'Renovación válida requerida para activar' USING ERRCODE='22023';
    END IF;
    UPDATE public.kioscos SET estado_suscripcion=v_estado WHERE id=k.id;
    UPDATE public.suscripciones SET estado=CASE v_estado WHEN 'ACTIVO' THEN 'ACTIVA' WHEN 'SUSPENDIDO' THEN 'SUSPENDIDA' ELSE 'VENCIDA' END WHERE id=s.id;
    salida:=jsonb_build_object('success',true,'kiosco_id',k.id,'estado',v_estado); evento:='CAMBIO_ESTADO';
  ELSIF p_tipo='CAMBIO_PLAN' THEN
    pid:=(p_datos->>'plan_id')::uuid;
    SELECT * INTO pl FROM public.planes WHERE id=pid AND activo FOR SHARE;
    IF s.id IS NULL OR pl.id IS NULL THEN RAISE EXCEPTION 'Plan o suscripción no disponible' USING ERRCODE='22023'; END IF;
    UPDATE public.suscripciones SET plan_id=pid WHERE id=s.id;
    salida:=jsonb_build_object('success',true,'suscripcion_id',s.id,'plan_id',pid); evento:='CAMBIO_PLAN';
  ELSIF p_tipo='MODIFICACION_PLAN' THEN
    pid:=(p_datos->>'plan_id')::uuid; monto:=(p_datos->>'precio')::numeric;
    IF pid IS NULL OR coalesce(length(btrim(p_datos->>'nombre')),0) NOT BETWEEN 1 AND 120
      OR p_datos->>'nombre'='__CONFIG_SISTEMA__' OR monto IS NULL OR monto<0
      OR monto::text IN ('NaN','Infinity','-Infinity') OR monto<>round(monto,2) OR monto>9999999999.99
      OR (p_datos->>'max_usuarios')::integer NOT BETWEEN 1 AND 100
      OR p_datos->>'max_usuarios' IS NULL OR jsonb_typeof(p_datos->'activo') IS DISTINCT FROM 'boolean'
      OR length(coalesce(p_datos->>'descripcion',''))>1000 THEN
      RAISE EXCEPTION 'Datos de plan inválidos' USING ERRCODE='22023';
    END IF;
    SELECT to_jsonb(p) INTO anterior FROM public.planes p WHERE id=pid FOR UPDATE;
    INSERT INTO public.planes(id,nombre,precio_mensual,max_usuarios,activo,descripcion)
      VALUES(pid,btrim(p_datos->>'nombre'),monto,(p_datos->>'max_usuarios')::integer,(p_datos->>'activo')::boolean,p_datos->>'descripcion')
      ON CONFLICT(id) DO UPDATE SET nombre=EXCLUDED.nombre,precio_mensual=EXCLUDED.precio_mensual,
        max_usuarios=EXCLUDED.max_usuarios,activo=EXCLUDED.activo,descripcion=EXCLUDED.descripcion
      RETURNING * INTO pl;
    salida:=jsonb_build_object('success',true,'plan',to_jsonb(pl)); evento:='MODIFICACION_PLAN';
  ELSIF p_tipo='CONFIGURACION' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_datos) x WHERE x NOT IN ('whatsapp_soporte','alias_mp','cbu_banco','titular_cuenta','banco_nombre','mensaje_soporte'))
      OR EXISTS(SELECT 1 FROM jsonb_each(p_datos) e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>500) THEN
      RAISE EXCEPTION 'Configuración inválida' USING ERRCODE='22023';
    END IF;
    SELECT to_jsonb(c) INTO anterior FROM public.configuracion_admin c WHERE id='general' FOR UPDATE;
    INSERT INTO public.configuracion_admin(id,whatsapp,alias_mp,cbu_banco,titular_cuenta,banco_nombre,mensaje_soporte)
      VALUES('general',coalesce(p_datos->>'whatsapp_soporte',''),coalesce(p_datos->>'alias_mp',''),coalesce(p_datos->>'cbu_banco',''),
      coalesce(p_datos->>'titular_cuenta',''),coalesce(p_datos->>'banco_nombre',''),coalesce(p_datos->>'mensaje_soporte',''))
      ON CONFLICT(id) DO UPDATE SET whatsapp=EXCLUDED.whatsapp,alias_mp=EXCLUDED.alias_mp,cbu_banco=EXCLUDED.cbu_banco,
        titular_cuenta=EXCLUDED.titular_cuenta,banco_nombre=EXCLUDED.banco_nombre,mensaje_soporte=EXCLUDED.mensaje_soporte,fecha_actualizacion=now();
    salida:=jsonb_build_object('success',true,'config',p_datos); evento:='CONFIGURACION';
  ELSIF p_tipo='EDITAR_COMERCIO' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_datos) x WHERE x NOT IN ('nombreKiosco','direccion','telefono','rubro','estadoKiosco','duenoUsuarioId','nombreDueno','emailDueno','suscripcionId','planId','fechaVencimiento'))
      OR coalesce(length(btrim(p_datos->>'nombreKiosco')),0) NOT BETWEEN 1 AND 120
      OR length(coalesce(p_datos->>'direccion',''))>250 OR length(coalesce(p_datos->>'telefono',''))>40
      OR length(coalesce(p_datos->>'nombreDueno',''))>120 OR length(coalesce(p_datos->>'emailDueno',''))>254
      OR coalesce(p_datos->>'estadoKiosco','') NOT IN ('ACTIVO','SOLO_LECTURA','SUSPENDIDO') THEN
      RAISE EXCEPTION 'Datos de comercio inválidos' USING ERRCODE='22023';
    END IF;
    IF nullif(p_datos->>'duenoUsuarioId','') IS NOT NULL THEN
      uid:=(p_datos->>'duenoUsuarioId')::uuid;
      PERFORM 1 FROM public.usuarios WHERE id=uid AND kiosco_id=k.id AND rol='DUEÑO' AND NOT es_superadmin FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Dueño fuera del comercio' USING ERRCODE='42501'; END IF;
      -- Email Auth changes require a separate Auth Admin flow; never change only the profile.
      IF p_datos->>'emailDueno' IS DISTINCT FROM (SELECT email FROM public.usuarios WHERE id=uid) THEN
        RAISE EXCEPTION 'Cambiar email requiere gestión Auth separada' USING ERRCODE='22023';
      END IF;
      UPDATE public.usuarios SET nombre=btrim(p_datos->>'nombreDueno') WHERE id=uid AND p_datos->>'nombreDueno' IS NOT NULL;
    END IF;
    IF nullif(p_datos->>'suscripcionId','') IS NOT NULL AND (p_datos->>'suscripcionId')::uuid IS DISTINCT FROM s.id THEN
      RAISE EXCEPTION 'Suscripción fuera del comercio' USING ERRCODE='42501';
    END IF;
    pid:=coalesce(nullif(p_datos->>'planId','')::uuid,s.plan_id);
    IF pid IS NOT NULL THEN
      PERFORM 1 FROM public.planes WHERE id=pid AND activo FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Plan no disponible' USING ERRCODE='22023'; END IF;
    END IF;
    fecha:=coalesce(nullif(p_datos->>'fechaVencimiento','')::date,s.fecha_vencimiento);
    v_estado:=p_datos->>'estadoKiosco';
    IF v_estado='ACTIVO' AND (s.id IS NULL OR fecha<public.comercial_hoy()) THEN
      RAISE EXCEPTION 'Vigencia válida requerida' USING ERRCODE='22023';
    END IF;
    IF fecha<s.fecha_inicio THEN RAISE EXCEPTION 'Vencimiento anterior al inicio' USING ERRCODE='22023'; END IF;
    UPDATE public.kioscos SET nombre=btrim(p_datos->>'nombreKiosco'),direccion=nullif(p_datos->>'direccion',''),
      telefono=nullif(p_datos->>'telefono',''),rubro=coalesce(nullif(p_datos->>'rubro',''),rubro),estado_suscripcion=v_estado WHERE id=k.id;
    UPDATE public.suscripciones SET plan_id=pid,fecha_vencimiento=fecha,
      estado=CASE v_estado WHEN 'ACTIVO' THEN 'ACTIVA' WHEN 'SUSPENDIDO' THEN 'SUSPENDIDA' ELSE 'VENCIDA' END WHERE id=s.id;
    salida:=jsonb_build_object('success',true,'kiosco_id',k.id); evento:='CAMBIO_DATOS_COMERCIO';
  ELSE
    RAISE EXCEPTION 'Operación comercial no permitida' USING ERRCODE='22023';
  END IF;
  nuevo:=salida;
  INSERT INTO public.auditoria_comercial_admin(operacion_id,actor_usuario_id,kiosco_id,tipo,estado_anterior,estado_nuevo,datos)
    VALUES(p_operacion_id,a.id,p_kiosco_id,evento,anterior,nuevo,p_datos);
  UPDATE public.operaciones_comerciales SET resultado=salida WHERE id=p_operacion_id;
  RETURN salida;
END $$;

CREATE OR REPLACE FUNCTION public.renovar_suscripcion_comercial(p_operacion_id uuid,p_kiosco_id uuid,p_meses integer,p_monto numeric,p_medio_pago text,p_notas text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$ SELECT public.comercial_mutar(p_operacion_id,'RENOVACION',p_kiosco_id,jsonb_build_object('meses',p_meses,'monto',p_monto,'medio_pago',p_medio_pago,'notas',p_notas)) $$;
CREATE OR REPLACE FUNCTION public.cambiar_estado_comercial(p_operacion_id uuid,p_kiosco_id uuid,p_estado text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$ SELECT public.comercial_mutar(p_operacion_id,'CAMBIO_ESTADO',p_kiosco_id,jsonb_build_object('estado',p_estado)) $$;
CREATE OR REPLACE FUNCTION public.cambiar_plan_comercial(p_operacion_id uuid,p_kiosco_id uuid,p_plan_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$ SELECT public.comercial_mutar(p_operacion_id,'CAMBIO_PLAN',p_kiosco_id,jsonb_build_object('plan_id',p_plan_id)) $$;
CREATE OR REPLACE FUNCTION public.actualizar_plan(p_operacion_id uuid,p_plan_id uuid,p_nombre text,p_precio numeric,p_max_usuarios integer,p_activo boolean,p_descripcion text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$ SELECT public.comercial_mutar(p_operacion_id,'MODIFICACION_PLAN',NULL,jsonb_build_object('plan_id',p_plan_id,'nombre',p_nombre,'precio',p_precio,'max_usuarios',p_max_usuarios,'activo',p_activo,'descripcion',p_descripcion)) $$;
CREATE OR REPLACE FUNCTION public.guardar_configuracion_comercial(p_operacion_id uuid,p_datos jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$ SELECT public.comercial_mutar(p_operacion_id,'CONFIGURACION',NULL,p_datos) $$;
CREATE OR REPLACE FUNCTION public.editar_comercio_comercial(p_operacion_id uuid,p_kiosco_id uuid,p_datos jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$ SELECT public.comercial_mutar(p_operacion_id,'EDITAR_COMERCIO',p_kiosco_id,p_datos) $$;

CREATE OR REPLACE FUNCTION public.leer_configuracion_comercial()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
BEGIN
  PERFORM public.comercial_actor(false);
  RETURN coalesce((SELECT jsonb_build_object('whatsapp_soporte',whatsapp,'alias_mp',alias_mp,'cbu_banco',cbu_banco,
    'titular_cuenta',titular_cuenta,'banco_nombre',banco_nombre,'mensaje_soporte',mensaje_soporte)
    FROM public.configuracion_admin WHERE id='general'),'{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.obtener_mi_suscripcion_comercial()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a public.usuarios; s public.suscripciones%ROWTYPE; pl public.planes%ROWTYPE; pagos jsonb;
BEGIN
  a:=public.comercial_actor(false);
  IF a.kiosco_id IS NULL THEN RAISE EXCEPTION 'Comercio requerido' USING ERRCODE='42501'; END IF;
  SELECT * INTO s FROM public.suscripciones WHERE kiosco_id=a.kiosco_id AND estado<>'CANCELADA';
  SELECT * INTO pl FROM public.planes WHERE id=s.plan_id;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'fecha_pago' DESC),'[]'::jsonb) INTO pagos
    FROM (SELECT jsonb_build_object('id',id,'suscripcion_id',suscripcion_id,'monto',monto,'fecha_pago',fecha_pago,
      'medio_pago',medio_pago,'meses',meses) AS x FROM public.pagos_suscripcion WHERE suscripcion_id=s.id) q;
  RETURN jsonb_build_object('suscripcion',CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s)||jsonb_build_object('plan',to_jsonb(pl)) END,
    'estado',public.estado_comercial_efectivo(a.kiosco_id),'dias_restantes',s.fecha_vencimiento-public.comercial_hoy(),
    'pagos',pagos,'instrucciones',public.leer_configuracion_comercial());
END $$;

CREATE OR REPLACE FUNCTION public.leer_administracion_comercial()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE kioscos jsonb; pagos jsonb;
BEGIN
  PERFORM public.comercial_actor(true);
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'fecha_creacion' DESC),'[]'::jsonb) INTO kioscos FROM (
    SELECT jsonb_build_object('kiosco_id',k.id,'nombre_kiosco',k.nombre,'direccion',k.direccion,'telefono_kiosco',k.telefono,'rubro',k.rubro,
      'estado_kiosco',public.estado_comercial_efectivo(k.id),'fecha_creacion',k.fecha_creacion,
      'dueno_usuario_id',u.id,'nombre_dueno',u.nombre,'email_dueno',u.email,'suscripcion_id',s.id,'fecha_inicio',s.fecha_inicio,
      'fecha_vencimiento',s.fecha_vencimiento,'estado_suscripcion',s.estado,'dias_restantes',s.fecha_vencimiento-public.comercial_hoy(),
      'plan_id',s.plan_id,'nombre_plan',p.nombre,'precio_mensual',p.precio_mensual,
      'fecha_ultimo_pago',pg.fecha_pago,'monto_ultimo_pago',pg.monto,'medio_ultimo_pago',pg.medio_pago) AS x
    FROM public.kioscos k LEFT JOIN public.suscripciones s ON s.kiosco_id=k.id AND s.estado<>'CANCELADA'
    LEFT JOIN public.planes p ON p.id=s.plan_id
    LEFT JOIN LATERAL (SELECT id,nombre,email FROM public.usuarios WHERE kiosco_id=k.id AND rol='DUEÑO' AND activo ORDER BY fecha_creacion,id LIMIT 1) u ON true
    LEFT JOIN LATERAL (SELECT * FROM public.pagos_suscripcion WHERE suscripcion_id=s.id ORDER BY fecha_pago DESC,id LIMIT 1) pg ON true
  ) q;
  SELECT coalesce(jsonb_agg(to_jsonb(pg)||jsonb_build_object('kiosco_id',s.kiosco_id,'nombre_kiosco',k.nombre,'nombre_plan',pl.nombre,
    'nombre_actor',u.nombre) ORDER BY pg.fecha_pago DESC),'[]'::jsonb) INTO pagos
    FROM public.pagos_suscripcion pg JOIN public.suscripciones s ON s.id=pg.suscripcion_id
    JOIN public.kioscos k ON k.id=s.kiosco_id JOIN public.planes pl ON pl.id=s.plan_id
    LEFT JOIN public.usuarios u ON u.id=pg.actor_usuario_id;
  RETURN jsonb_build_object('kioscos',kioscos,'planes',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY precio_mensual,id)
    FROM public.planes p WHERE nombre<>'__CONFIG_SISTEMA__'),'[]'::jsonb),'pagos',pagos,
    'auditoria',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY creado_en DESC) FROM public.auditoria_comercial_admin a),'[]'::jsonb));
END $$;

-- No direct table writes, including historical permissive policies/grants.
DO $$
DECLARE t text; pol record; col record;
BEGIN
  FOREACH t IN ARRAY ARRAY['planes','suscripciones','pagos_suscripcion','configuracion_admin','operaciones_comerciales','auditoria_comercial_admin'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
    FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=to_regclass('public.'||t) AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated,service_role',col.attname,t);
    END LOOP;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,t);
    END LOOP;
  END LOOP;
  -- The historical admin view may bypass RLS. Remove its API grants if installed.
  IF to_regclass('public.v_admin_kioscos') IS NOT NULL THEN
    REVOKE ALL ON public.v_admin_kioscos FROM PUBLIC,anon,authenticated,service_role;
    FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='public.v_admin_kioscos'::regclass AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON public.v_admin_kioscos FROM PUBLIC,anon,authenticated,service_role',col.attname);
    END LOOP;
  END IF;
END $$;
-- Normalize legacy read policies too, without denying the profile needed for login.
DO $$
DECLARE t text; pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY['kioscos','usuarios'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,t);
    END LOOP;
  END LOOP;
END $$;
CREATE POLICY kioscos_commercial_read_scope ON public.kioscos FOR SELECT TO authenticated
  USING(id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY usuarios_commercial_read_scope ON public.usuarios FOR SELECT TO authenticated
  USING(auth_user_id=auth.uid() OR kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.kioscos,public.usuarios FROM PUBLIC,anon,authenticated,service_role;
DO $$
DECLARE t text; col record;
BEGIN
  FOREACH t IN ARRAY ARRAY['kioscos','usuarios'] LOOP
    FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=to_regclass('public.'||t) AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE INSERT (%I),UPDATE (%I),REFERENCES (%I) ON public.%I FROM PUBLIC,anon,authenticated,service_role',
        col.attname,col.attname,col.attname,t);
    END LOOP;
  END LOOP;
END $$;
-- Historical RPCs must not remain an alternate unaudited commercial write path.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('fn_renovar_suscripcion','fn_eliminar_kiosco','admin_eliminar_kiosco') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  END LOOP;
END $$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND (proname LIKE 'comercial_%' OR proname IN
      ('estado_comercial_efectivo','renovar_suscripcion_comercial','cambiar_estado_comercial','cambiar_plan_comercial',
       'actualizar_plan','guardar_configuracion_comercial','editar_comercio_comercial','leer_configuracion_comercial',
       'obtener_mi_suscripcion_comercial','leer_administracion_comercial')) LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  END LOOP;
END $$;
-- Grant only the reviewed signatures, never legacy overloads with the same name.
GRANT EXECUTE ON FUNCTION public.renovar_suscripcion_comercial(uuid,uuid,integer,numeric,text,text),
  public.cambiar_estado_comercial(uuid,uuid,text),public.cambiar_plan_comercial(uuid,uuid,uuid),
  public.actualizar_plan(uuid,uuid,text,numeric,integer,boolean,text),
  public.guardar_configuracion_comercial(uuid,jsonb),public.editar_comercio_comercial(uuid,uuid,jsonb),
  public.leer_configuracion_comercial(),public.obtener_mi_suscripcion_comercial(),
  public.leer_administracion_comercial() TO authenticated;
CREATE OR REPLACE FUNCTION public.obtener_estado_operativo_comercial()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE kid uuid;
BEGIN
  SELECT kiosco_id INTO kid FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo;
  IF kid IS NULL THEN RAISE EXCEPTION 'Perfil de comercio activo requerido' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('estado',public.estado_comercial_efectivo(kid));
END $$;
ALTER FUNCTION public.obtener_estado_operativo_comercial() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.obtener_estado_operativo_comercial() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.obtener_estado_operativo_comercial() TO authenticated;
-- Preserve existing server-side staff provisioning with column-limited service
-- grants. No browser gets these grants; commerce/owner creation uses saga RPCs.
GRANT INSERT(auth_user_id,kiosco_id,nombre,email,rol,activo,es_superadmin),
  UPDATE(auth_user_id,email) ON public.usuarios TO service_role;
COMMIT;
