-- Incremental optional module. Install after envases/002 and returns/002.
-- No commerce is enabled; historical operations retain their exact ACK.
BEGIN;
CREATE TABLE IF NOT EXISTS public.envases_pendientes (
  kiosco_id uuid NOT NULL, tipo_id text NOT NULL,
  cantidad integer NOT NULL DEFAULT 0 CHECK(cantidad BETWEEN 0 AND 999999999),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(kiosco_id,tipo_id),
  FOREIGN KEY(kiosco_id,tipo_id) REFERENCES public.envases_tipos_comercio(kiosco_id,id)
);
ALTER TABLE public.envases_pendientes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.envases_pendientes FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE cols text; BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid='public.envases_pendientes'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.envases_pendientes FROM PUBLIC,anon,authenticated,service_role',cols,cols,cols,cols);
END $$;
GRANT SELECT ON public.envases_pendientes TO authenticated;
DROP POLICY IF EXISTS pendientes_lectura ON public.envases_pendientes;
CREATE POLICY pendientes_lectura ON public.envases_pendientes FOR SELECT TO authenticated USING(kiosco_id=public.auth_user_kiosco_id());
DROP POLICY IF EXISTS pendientes_aislamiento ON public.envases_pendientes;
CREATE POLICY pendientes_aislamiento ON public.envases_pendientes AS RESTRICTIVE FOR ALL TO authenticated USING(kiosco_id=public.auth_user_kiosco_id()) WITH CHECK(kiosco_id=public.auth_user_kiosco_id());
DROP TRIGGER IF EXISTS comercial_estado_write_gate ON public.envases_pendientes;
CREATE TRIGGER comercial_estado_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.envases_pendientes FOR EACH ROW EXECUTE FUNCTION public.validar_escritura_comercial_operativa();
ALTER TABLE public.envases_movimientos
 ADD COLUMN IF NOT EXISTS pendientes_delta integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS pendientes_resultantes integer CHECK(pendientes_resultantes BETWEEN 0 AND 999999999);
ALTER TABLE public.envases_movimientos DROP CONSTRAINT IF EXISTS envases_movimientos_accion_check;
ALTER TABLE public.envases_movimientos ADD CONSTRAINT envases_movimientos_accion_check CHECK(accion IN ('AJUSTAR_SALDO','ENTREGAR_DISTRIBUIDOR','RECIBIR_EFECTIVO','RECIBIR_TICKET','DEVOLVER_CLIENTE','AJUSTAR_PENDIENTES','RECIBIR_PENDIENTES'));
-- New columns must not inherit write grants through default privileges.
REVOKE INSERT(pendientes_delta,pendientes_resultantes),UPDATE(pendientes_delta,pendientes_resultantes),REFERENCES(pendientes_delta,pendientes_resultantes) ON public.envases_movimientos FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.operar_envases_atomico(p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
<<operacion_envase>>
DECLARE a public.usuarios%ROWTYPE; previa public.envases_operaciones%ROWTYPE;
  tipo public.envases_tipos_comercio%ROWTYPE; d jsonb; accion text; tipo_id text; op_id uuid;
  pendiente_antes integer; pendiente_despues integer; pendiente_delta integer:=0;
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
    OR accion NOT IN ('CONFIGURAR_TIPO','AJUSTAR_SALDO','ENTREGAR_DISTRIBUIDOR','RECIBIR_EFECTIVO','AJUSTAR_PENDIENTES','RECIBIR_PENDIENTES') THEN
    RAISE EXCEPTION 'Tipo de operación de envases inválido' USING ERRCODE='22023';
  END IF;
  BEGIN SELECT * INTO STRICT a FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Identidad de envases no autorizada' USING ERRCODE='42501';
  END;
  IF a.kiosco_id IS NULL OR a.rol IS NULL OR a.rol NOT IN ('DUEÑO','CAJERO')
    OR (accion NOT IN ('RECIBIR_EFECTIVO','RECIBIR_PENDIENTES') AND a.rol<>'DUEÑO') THEN
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
    INSERT INTO public.envases_pendientes(kiosco_id,tipo_id) VALUES(a.kiosco_id,tipo_id) ON CONFLICT DO NOTHING;
    SELECT p.cantidad INTO pendiente_antes FROM public.envases_pendientes p
      WHERE p.kiosco_id=a.kiosco_id AND p.tipo_id=operacion_envase.tipo_id FOR UPDATE;
    pendiente_despues:=pendiente_antes;
    IF accion='AJUSTAR_PENDIENTES' THEN
      IF d-ARRAY['pendientesEsperados','nuevosPendientes','notas']<>'{}'::jsonb
        OR NOT(d?&ARRAY['pendientesEsperados','nuevosPendientes','notas'])
        OR jsonb_typeof(d->'pendientesEsperados') IS DISTINCT FROM 'number'
        OR jsonb_typeof(d->'nuevosPendientes') IS DISTINCT FROM 'number'
        OR jsonb_typeof(d->'notas') IS DISTINCT FROM 'string'
        OR length(btrim(notas))=0 OR notas<>btrim(notas) THEN RAISE EXCEPTION 'Pendientes inválidos'; END IF;
      n:=(d->>'nuevosPendientes')::numeric;
      IF n<0 OR n>999999999 OR n<>trunc(n) OR (d->>'pendientesEsperados')::numeric IS DISTINCT FROM pendiente_antes::numeric THEN
        RAISE EXCEPTION 'Pendientes cambiaron o cantidad inválida; recargá'; END IF;
      pendiente_despues:=n::integer; pendiente_delta:=pendiente_despues-pendiente_antes;
      cantidad:=0; despues:=antes;
    ELSIF accion='RECIBIR_PENDIENTES' THEN
      IF d-ARRAY['cantidad','notas']<>'{}'::jsonb OR NOT(d?&ARRAY['cantidad','notas'])
        OR jsonb_typeof(d->'cantidad') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Recepción pendiente inválida'; END IF;
      n:=(d->>'cantidad')::numeric;
      IF n<1 OR n>999999 OR n<>trunc(n) OR n>pendiente_antes THEN RAISE EXCEPTION 'Cantidad supera pendientes o es inválida'; END IF;
      cantidad:=n::integer; despues:=antes+cantidad; pendiente_delta:=-cantidad;
      pendiente_despues:=pendiente_antes-cantidad;
      IF despues>999999999 THEN RAISE EXCEPTION 'Stock de vacíos fuera de rango'; END IF;
    ELSIF accion='AJUSTAR_SALDO' THEN
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
    IF accion IN ('AJUSTAR_PENDIENTES','RECIBIR_PENDIENTES') THEN
      UPDATE public.envases_pendientes p SET cantidad=pendiente_despues,actualizado_en=now()
        WHERE p.kiosco_id=a.kiosco_id AND p.tipo_id=operacion_envase.tipo_id;
      GET DIAGNOSTICS filas=ROW_COUNT;
      IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el pendiente'; END IF;
    END IF;
    IF caja IS NOT NULL THEN
      INSERT INTO public.movimientos_caja(id,kiosco_id,sesion_caja_id,usuario_id,tipo,motivo,monto,descripcion)
        VALUES(op_id,a.kiosco_id,caja,a.id,'EGRESO','DEVOLUCION_ENVASE',importe,'Recepción de envases '||tipo.nombre);
      GET DIAGNOSTICS filas=ROW_COUNT;
      IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el egreso de caja'; END IF;
    END IF;
    resultado:=jsonb_build_object('id',op_id,'kiosco_id',a.kiosco_id,'tipo_id',tipo_id,'stock_vacios',despues,'importe',importe);
  END IF;
  IF accion IN ('AJUSTAR_PENDIENTES','RECIBIR_PENDIENTES') THEN
    resultado:=resultado||jsonb_build_object('pendientes',pendiente_despues);
  END IF;
  INSERT INTO public.envases_operaciones(id,kiosco_id,actor_auth_id,solicitud,resultado)
    VALUES(op_id,a.kiosco_id,auth.uid(),p_solicitud,resultado);
  GET DIAGNOSTICS filas=ROW_COUNT;
  IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó la operación de envases'; END IF;
  IF accion<>'CONFIGURAR_TIPO' THEN
    INSERT INTO public.envases_movimientos(id,kiosco_id,tipo_id,usuario_id,accion,cantidad,stock_resultante,importe,sesion_caja_id,distribuidor,notas,pendientes_delta,pendientes_resultantes)
      VALUES(op_id,a.kiosco_id,tipo_id,a.id,accion,cantidad,despues,importe,caja,distribuidor,notas,pendiente_delta,CASE WHEN accion IN ('AJUSTAR_PENDIENTES','RECIBIR_PENDIENTES') THEN pendiente_despues ELSE NULL END);
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
