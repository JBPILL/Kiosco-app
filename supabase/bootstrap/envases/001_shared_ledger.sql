-- Optional module. Requires the validated baseline and commercial write gate.
-- Does not migrate terminal-local quantities and does not enable ticket receipts.
BEGIN;
DO $$ BEGIN
  IF to_regprocedure('public.exigir_comercio_operativo(uuid)') IS NULL OR to_regprocedure('public.exigir_capacidad_operativa_piloto(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta el control comercial operativo';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.envases_tipos_comercio (
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  id text NOT NULL CHECK(length(btrim(id)) BETWEEN 1 AND 150),
  nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 1 AND 150),
  precio numeric(14,2) NOT NULL CHECK(precio>=0 AND precio<>'NaN'::numeric),
  activo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(kiosco_id,id)
);
CREATE TABLE IF NOT EXISTS public.envases_saldos (
  kiosco_id uuid NOT NULL,
  tipo_id text NOT NULL,
  cantidad integer NOT NULL DEFAULT 0 CHECK(cantidad BETWEEN 0 AND 999999999),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(kiosco_id,tipo_id),
  FOREIGN KEY(kiosco_id,tipo_id) REFERENCES public.envases_tipos_comercio(kiosco_id,id)
);
CREATE TABLE IF NOT EXISTS public.envases_operaciones (
  id uuid PRIMARY KEY,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  actor_auth_id uuid NOT NULL,
  solicitud jsonb NOT NULL,
  resultado jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK(jsonb_typeof(solicitud)='object' AND jsonb_typeof(resultado)='object'),
  CHECK((solicitud->>'id')::uuid=id AND (resultado->>'id')::uuid=id)
);
CREATE TABLE IF NOT EXISTS public.envases_movimientos (
  id uuid PRIMARY KEY REFERENCES public.envases_operaciones(id),
  kiosco_id uuid NOT NULL,
  tipo_id text NOT NULL,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  accion text NOT NULL CHECK(accion IN ('AJUSTAR_SALDO','ENTREGAR_DISTRIBUIDOR','RECIBIR_EFECTIVO')),
  cantidad integer NOT NULL,
  stock_resultante integer NOT NULL CHECK(stock_resultante>=0),
  importe numeric(12,2) NOT NULL DEFAULT 0 CHECK(importe>=0),
  sesion_caja_id uuid REFERENCES public.sesiones_caja(id),
  distribuidor text,
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(kiosco_id,tipo_id) REFERENCES public.envases_tipos_comercio(kiosco_id,id)
);

-- Revoke both table and any inherited/default column grants. Ledger stays private.
DO $$ DECLARE t text; cols text; r text; BEGIN
  FOREACH t IN ARRAY ARRAY['envases_tipos_comercio','envases_saldos','envases_operaciones','envases_movimientos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
    SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute
      WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role',cols,cols,cols,cols,t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE')
        OR has_any_column_privilege(r,'public.'||t,'INSERT,UPDATE') THEN
        RAISE EXCEPTION 'Escritura heredada en % para %',t,r;
      END IF;
    END LOOP;
    IF t<>'envases_operaciones' THEN
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
      EXECUTE format('DROP POLICY IF EXISTS envases_lectura_piloto ON public.%I',t);
      EXECUTE format('CREATE POLICY envases_lectura_piloto ON public.%I FOR SELECT TO authenticated USING(kiosco_id=public.auth_user_kiosco_id())',t);
      EXECUTE format('DROP POLICY IF EXISTS envases_aislamiento_piloto ON public.%I',t);
      EXECUTE format('CREATE POLICY envases_aislamiento_piloto ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(kiosco_id=public.auth_user_kiosco_id()) WITH CHECK(kiosco_id=public.auth_user_kiosco_id())',t);
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS comercial_estado_write_gate ON public.%I',t);
    EXECUTE format('CREATE TRIGGER comercial_estado_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validar_escritura_comercial_operativa()',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.operar_envases_atomico(p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
<<operacion_envase>>
DECLARE a public.usuarios%ROWTYPE; previa public.envases_operaciones%ROWTYPE;
  tipo public.envases_tipos_comercio%ROWTYPE; d jsonb; accion text; tipo_id text; op_id uuid;
  n numeric; cantidad integer; antes integer; despues integer; importe numeric:=0;
  precio numeric; caja uuid; distribuidor text; notas text; resultado jsonb; filas integer; confirmado integer;
BEGIN
  IF jsonb_typeof(p_solicitud) IS DISTINCT FROM 'object'
    OR p_solicitud - ARRAY['version','id','accion','tipoId','datos'] <> '{}'::jsonb
    OR NOT(p_solicitud ?& ARRAY['version','id','accion','tipoId','datos'])
    OR p_solicitud->'version' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(p_solicitud->'id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_solicitud->'accion') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_solicitud->'tipoId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_solicitud->'datos') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Solicitud de envases inválida' USING ERRCODE='22023';
  END IF;
  op_id:=(p_solicitud->>'id')::uuid; tipo_id:=p_solicitud->>'tipoId';
  accion:=p_solicitud->>'accion'; d:=p_solicitud->'datos';
  IF length(btrim(tipo_id)) NOT BETWEEN 1 AND 150 OR tipo_id<>btrim(tipo_id)
    OR accion NOT IN ('CONFIGURAR_TIPO','AJUSTAR_SALDO','ENTREGAR_DISTRIBUIDOR','RECIBIR_EFECTIVO') THEN
    RAISE EXCEPTION 'Tipo de operación de envases inválido' USING ERRCODE='22023';
  END IF;
  BEGIN SELECT * INTO STRICT a FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Identidad de envases no autorizada' USING ERRCODE='42501';
  END;
  IF a.kiosco_id IS NULL OR a.rol IS NULL OR a.rol NOT IN ('DUEÑO','CAJERO')
    OR (accion<>'RECIBIR_EFECTIVO' AND a.rol<>'DUEÑO') THEN
    RAISE EXCEPTION 'Rol de envases no autorizado' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('envases:'||op_id::text,0));
  SELECT * INTO previa FROM public.envases_operaciones WHERE id=op_id;
  IF FOUND THEN
    IF previa.actor_auth_id IS DISTINCT FROM auth.uid() OR previa.kiosco_id IS DISTINCT FROM a.kiosco_id
      OR previa.solicitud IS DISTINCT FROM p_solicitud THEN
      RAISE EXCEPTION 'El reintento debe conservar actor y solicitud original' USING ERRCODE='22023';
    END IF;
    RETURN previa.resultado;
  END IF;
  PERFORM public.exigir_comercio_operativo(a.kiosco_id);
  PERFORM public.exigir_capacidad_operativa_piloto(a.kiosco_id,'ENVASES');
  -- Cash first, then type/saldo: same order required by the future checkout hook.
  IF accion='RECIBIR_EFECTIVO' THEN
    IF d-ARRAY['cantidad','sesionCajaId','precioEsperado','notas']<>'{}'::jsonb OR NOT(d?&ARRAY['cantidad','sesionCajaId','precioEsperado','notas'])
      OR jsonb_typeof(d->'sesionCajaId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(d->'precioEsperado') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Recepción de envase inválida'; END IF;
    caja:=(d->>'sesionCajaId')::uuid;
    PERFORM 1 FROM public.sesiones_caja WHERE id=caja AND kiosco_id=a.kiosco_id AND estado='ABIERTA' AND fecha_cierre IS NULL
      AND (usuario_id=a.id OR a.rol='DUEÑO') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Se requiere caja abierta del comercio'; END IF;
  END IF;
  -- Serializes config, stock and cash actions for the same type across terminals.
  PERFORM pg_advisory_xact_lock(hashtextextended('envases-tipo:'||a.kiosco_id::text||':'||tipo_id,0));
  IF accion='CONFIGURAR_TIPO' THEN
    IF d - ARRAY['nombre','precio','activo'] <> '{}'::jsonb
      OR NOT(d ?& ARRAY['nombre','precio','activo'])
      OR jsonb_typeof(d->'nombre') IS DISTINCT FROM 'string'
      OR length(btrim(d->>'nombre')) NOT BETWEEN 1 AND 150
      OR jsonb_typeof(d->'precio') IS DISTINCT FROM 'number'
      OR jsonb_typeof(d->'activo') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Configuración de envase inválida' USING ERRCODE='22023';
    END IF;
    precio:=(d->>'precio')::numeric;
    IF precio<0 OR precio>9999999999.99 OR precio<>round(precio,2) THEN RAISE EXCEPTION 'Precio de envase inválido'; END IF;
    INSERT INTO public.envases_tipos_comercio(kiosco_id,id,nombre,precio,activo)
      VALUES(a.kiosco_id,tipo_id,btrim(d->>'nombre'),precio,(d->>'activo')::boolean)
      ON CONFLICT(kiosco_id,id) DO UPDATE SET nombre=EXCLUDED.nombre,precio=EXCLUDED.precio,activo=EXCLUDED.activo,updated_at=now();
    GET DIAGNOSTICS filas=ROW_COUNT;
    IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el tipo de envase'; END IF;
    INSERT INTO public.envases_saldos(kiosco_id,tipo_id) VALUES(a.kiosco_id,tipo_id) ON CONFLICT DO NOTHING;
    SELECT s.cantidad INTO despues FROM public.envases_saldos s WHERE s.kiosco_id=a.kiosco_id AND s.tipo_id=operacion_envase.tipo_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'No se confirmó el saldo de envases'; END IF;
    resultado:=jsonb_build_object('id',op_id,'kiosco_id',a.kiosco_id,'tipo_id',tipo_id,'stock_vacios',despues,'precio',precio);
  ELSE
    SELECT * INTO tipo FROM public.envases_tipos_comercio t WHERE t.kiosco_id=a.kiosco_id AND t.id=tipo_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tipo de envase no disponible' USING ERRCODE='22023'; END IF;
    INSERT INTO public.envases_saldos(kiosco_id,tipo_id) VALUES(a.kiosco_id,tipo_id) ON CONFLICT DO NOTHING;
    SELECT s.cantidad INTO antes FROM public.envases_saldos s
      WHERE s.kiosco_id=a.kiosco_id AND s.tipo_id=operacion_envase.tipo_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No se confirmó el saldo de envases'; END IF;
    IF jsonb_typeof(d->'notas') NOT IN ('string','null') OR NOT(d?'notas')
      OR length(d->>'notas')>1000 THEN RAISE EXCEPTION 'Notas de envase inválidas'; END IF;
    notas:=d->>'notas';
    IF accion='AJUSTAR_SALDO' THEN
      IF d-ARRAY['stockEsperado','nuevoStock','notas']<>'{}'::jsonb
        OR NOT(d?&ARRAY['stockEsperado','nuevoStock','notas'])
        OR jsonb_typeof(d->'stockEsperado') IS DISTINCT FROM 'number'
        OR jsonb_typeof(d->'nuevoStock') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Ajuste de envase inválido'; END IF;
      n:=(d->>'nuevoStock')::numeric;
      IF n<0 OR n>999999999 OR n<>trunc(n) OR (d->>'stockEsperado')::numeric IS DISTINCT FROM antes::numeric THEN
        RAISE EXCEPTION 'Stock cambió o ajuste inválido; recargá antes de ajustar' USING ERRCODE='22023';
      END IF;
      despues:=n::integer; cantidad:=despues-antes;
    ELSE
      IF jsonb_typeof(d->'cantidad') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Cantidad de envase inválida'; END IF;
      n:=(d->>'cantidad')::numeric;
      IF n<1 OR n>999999 OR n<>trunc(n) THEN RAISE EXCEPTION 'Cantidad de envase inválida'; END IF;
      cantidad:=n::integer;
      IF accion='ENTREGAR_DISTRIBUIDOR' THEN
        IF d-ARRAY['cantidad','distribuidor','notas']<>'{}'::jsonb OR NOT(d?&ARRAY['cantidad','distribuidor','notas'])
          OR jsonb_typeof(d->'distribuidor') IS DISTINCT FROM 'string'
          OR length(btrim(d->>'distribuidor')) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'Distribuidor inválido'; END IF;
        distribuidor:=btrim(d->>'distribuidor'); cantidad:=-cantidad;
      ELSE
        IF NOT tipo.activo THEN
          RAISE EXCEPTION 'Recepción de envase inválida';
        END IF;
        IF (d->>'precioEsperado')::numeric IS DISTINCT FROM tipo.precio THEN
          RAISE EXCEPTION 'El precio del envase cambió; recargá antes de confirmar' USING ERRCODE='22023';
        END IF;
        importe:=cantidad*tipo.precio;
        IF importe<=0 OR importe>9999999999.99 THEN RAISE EXCEPTION 'Importe de envases inválido'; END IF;
      END IF;
      despues:=antes+cantidad;
      IF despues<0 OR despues>999999999 THEN RAISE EXCEPTION 'Stock de vacíos insuficiente o fuera de rango'; END IF;
    END IF;
    UPDATE public.envases_saldos s SET cantidad=despues,actualizado_en=now()
      WHERE s.kiosco_id=a.kiosco_id AND s.tipo_id=operacion_envase.tipo_id RETURNING s.cantidad INTO confirmado;
    IF NOT FOUND OR confirmado IS DISTINCT FROM despues THEN RAISE EXCEPTION 'No se confirmó el saldo de envases'; END IF;
    IF caja IS NOT NULL THEN
      INSERT INTO public.movimientos_caja(id,kiosco_id,sesion_caja_id,usuario_id,tipo,motivo,monto,descripcion)
        VALUES(op_id,a.kiosco_id,caja,a.id,'EGRESO','DEVOLUCION_ENVASE',importe,'Recepción de envases '||tipo.nombre);
      GET DIAGNOSTICS filas=ROW_COUNT;
      IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el egreso de caja'; END IF;
    END IF;
    resultado:=jsonb_build_object('id',op_id,'kiosco_id',a.kiosco_id,'tipo_id',tipo_id,'stock_vacios',despues,'importe',importe);
  END IF;
  INSERT INTO public.envases_operaciones(id,kiosco_id,actor_auth_id,solicitud,resultado)
    VALUES(op_id,a.kiosco_id,auth.uid(),p_solicitud,resultado);
  GET DIAGNOSTICS filas=ROW_COUNT;
  IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó la operación de envases'; END IF;
  IF accion<>'CONFIGURAR_TIPO' THEN
    INSERT INTO public.envases_movimientos(id,kiosco_id,tipo_id,usuario_id,accion,cantidad,stock_resultante,importe,sesion_caja_id,distribuidor,notas)
      VALUES(op_id,a.kiosco_id,tipo_id,a.id,accion,cantidad,despues,importe,caja,distribuidor,notas);
    GET DIAGNOSTICS filas=ROW_COUNT;
    IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el movimiento de envases'; END IF;
  END IF;
  RETURN resultado;
END $$;
ALTER FUNCTION public.operar_envases_atomico(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.operar_envases_atomico(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.operar_envases_atomico(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
