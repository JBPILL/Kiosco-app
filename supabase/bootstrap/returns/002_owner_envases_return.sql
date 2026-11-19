-- Owner-only full-ticket return: refund paid cash AND return received empties.
-- Existing ACKs (including the retired keep-empties mode) remain recoverable.
-- Install AFTER returns/001 and envases/002. Never enables a commerce.
BEGIN;
ALTER TABLE public.devoluciones_parciales_atomicas DROP CONSTRAINT IF EXISTS devoluciones_parciales_atomicas_check;
ALTER TABLE public.devoluciones_parciales_atomicas ADD CONSTRAINT devoluciones_parciales_atomicas_check
 CHECK ((jsonb_typeof(solicitud)='object'
   AND solicitud->>'id'=id::text AND solicitud->>'ventaId'=venta_id::text
   AND jsonb_typeof(solicitud->'items')='array'
   AND (solicitud->'version'='1'::jsonb OR (solicitud->'version'='2'::jsonb
     AND solicitud->>'modalidadEnvases' IN ('CONSERVAR_ENVASES','ENTREGAR_ENVASES')
     AND resultado#>>'{envases,modalidad}'=solicitud->>'modalidadEnvases'))) IS TRUE);
ALTER TABLE public.envases_movimientos DROP CONSTRAINT IF EXISTS envases_movimientos_accion_check;
ALTER TABLE public.envases_movimientos ADD CONSTRAINT envases_movimientos_accion_check
 CHECK(accion IN ('AJUSTAR_SALDO','ENTREGAR_DISTRIBUIDOR','RECIBIR_EFECTIVO','RECIBIR_TICKET','DEVOLVER_CLIENTE'));
CREATE OR REPLACE FUNCTION public.preparar_devolucion_envases_piloto(p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor public.usuarios%ROWTYPE; v public.ventas%ROWTYPE; op public.checkout_manuales%ROWTYPE;
  anterior public.devoluciones_parciales_atomicas%ROWTYPE;
  solicitud_id uuid; v_venta_id uuid; previos jsonb; plan jsonb; item jsonb; mercaderia jsonb; envases jsonb; credito numeric; base_importe numeric;
BEGIN
  BEGIN
    SELECT * INTO STRICT actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Identidad de devolución no autorizada' USING ERRCODE='42501';
  END;
  IF actor.rol IS DISTINCT FROM 'DUEÑO' THEN
    RAISE EXCEPTION 'Rol de devolución no autorizado' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.kioscos WHERE id=actor.kiosco_id AND estado_suscripcion='ACTIVO' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio no habilitado' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_solicitud) IS DISTINCT FROM 'object'
    OR NOT (p_solicitud ?& ARRAY['version','id','ventaId','metodo','motivo','notas','sesionReintegroId','items','modalidadEnvases']::text[])
    OR p_solicitud - ARRAY['version','id','ventaId','metodo','motivo','notas','sesionReintegroId','items','modalidadEnvases']::text[] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Solicitud de devolución inválida' USING ERRCODE='22023';
  END IF;
  IF p_solicitud->'version' IS DISTINCT FROM '2'::jsonb
    OR jsonb_typeof(p_solicitud->'modalidadEnvases') IS DISTINCT FROM 'string'
    OR p_solicitud->>'modalidadEnvases' IS DISTINCT FROM 'ENTREGAR_ENVASES'
    OR p_solicitud->>'metodo' IS DISTINCT FROM 'EFECTIVO_CAJA'
    OR jsonb_typeof(p_solicitud->'id') IS DISTINCT FROM 'string'
    OR (p_solicitud->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_solicitud->'ventaId') IS DISTINCT FROM 'string'
    OR (p_solicitud->>'ventaId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_solicitud->'metodo') IS DISTINCT FROM 'string'
    OR p_solicitud->>'metodo' NOT IN ('EFECTIVO_CAJA','CUENTA_CORRIENTE','OTRO')
    OR jsonb_typeof(p_solicitud->'motivo') IS DISTINCT FROM 'string'
    OR p_solicitud->>'motivo' NOT IN ('CAMBIO_PRODUCTO','FALLA_ROTURA','VENCIDO','ERROR_COBRO','OTRO')
    OR (p_solicitud->'notas' IS DISTINCT FROM 'null'::jsonb
      AND (jsonb_typeof(p_solicitud->'notas') IS DISTINCT FROM 'string' OR length(p_solicitud->>'notas')>1000))
    OR (p_solicitud->'sesionReintegroId' IS DISTINCT FROM 'null'::jsonb
      AND (jsonb_typeof(p_solicitud->'sesionReintegroId') IS DISTINCT FROM 'string'
        OR (p_solicitud->>'sesionReintegroId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
    OR ((p_solicitud->>'metodo'='EFECTIVO_CAJA') IS DISTINCT FROM (jsonb_typeof(p_solicitud->'sesionReintegroId')='string')) THEN
    RAISE EXCEPTION 'Solicitud de devolución inválida' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_solicitud->'items') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_solicitud->'items') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Solicitud de devolución inválida' USING ERRCODE='22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_solicitud->'items') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR NOT (item ?& ARRAY['detalleId','cantidad','reingresaStock']::text[])
      OR item - ARRAY['detalleId','cantidad','reingresaStock']::text[] <> '{}'::jsonb
      OR jsonb_typeof(item->'detalleId') IS DISTINCT FROM 'string'
      OR (item->>'detalleId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(item->'cantidad') IS DISTINCT FROM 'number'
      OR jsonb_typeof(item->'reingresaStock') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Solicitud de devolución inválida' USING ERRCODE='22023';
    END IF;
    IF (item->>'cantidad')::numeric < 0.001 OR (item->>'cantidad')::numeric > 999999
      OR round((item->>'cantidad')::numeric,3)<>(item->>'cantidad')::numeric THEN
      RAISE EXCEPTION 'Solicitud de devolución inválida' USING ERRCODE='22023';
    END IF;
  END LOOP;
  solicitud_id:=(p_solicitud->>'id')::uuid;
  v_venta_id:=(p_solicitud->>'ventaId')::uuid;
  -- Mismo orden que cierre/anulación. La RPC debe conservar estos bloqueos
  -- mientras confirma stock, reintegro y registro, sin llamadas HTTP intermedias.
  SELECT * INTO op FROM public.checkout_manuales
    WHERE checkout_manuales.venta_id=v_venta_id AND kiosco_id=actor.kiosco_id FOR UPDATE;
  IF NOT FOUND OR op.resultado IS NULL THEN
    RAISE EXCEPTION 'Falta cierre histórico confirmado; requiere conciliación' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v FROM public.ventas WHERE id=v_venta_id AND kiosco_id=actor.kiosco_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no disponible' USING ERRCODE='42501'; END IF;
  SELECT * INTO anterior FROM public.devoluciones_parciales_atomicas WHERE id=solicitud_id;
  IF FOUND THEN
    IF anterior.venta_id<>v.id OR anterior.kiosco_id<>actor.kiosco_id
      OR anterior.actor_auth_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Solicitud pertenece a otra operación' USING ERRCODE='42501';
    END IF;
    IF anterior.solicitud IS DISTINCT FROM p_solicitud THEN
      RAISE EXCEPTION 'El reintento debe conservar la solicitud original' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('confirmada',true,'resultado',anterior.resultado);
  END IF;
  IF v.estado IS DISTINCT FROM 'COMPLETADA'
    OR v.total IS DISTINCT FROM (op.solicitud->>'total')::numeric
    OR (op.solicitud->>'id')::uuid IS DISTINCT FROM v.id
    OR (op.solicitud->>'kiosco_id')::uuid IS DISTINCT FROM v.kiosco_id THEN
    RAISE EXCEPTION 'Venta histórica inconsistente' USING ERRCODE='22023';
  END IF;
  IF NULLIF(to_jsonb(v)->>'afip_cae','') IS NOT NULL THEN
    RAISE EXCEPTION 'Comprobante fiscal requiere circuito de nota de crédito' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.devoluciones_venta d WHERE d.venta_id=v.id
    AND NOT EXISTS(SELECT 1 FROM public.devoluciones_parciales_atomicas a WHERE a.id=d.id AND a.venta_id=v.id)) THEN
    RAISE EXCEPTION 'Devolución antigua sin detalle verificable; requiere conciliación' USING ERRCODE='22023';
  END IF;
  IF EXISTS(WITH historicos AS (SELECT (e->>'id')::uuid id,e->>'medio_pago' medio,(e->>'monto')::numeric monto
      FROM jsonb_array_elements(op.solicitud->'pagos') e),
    actuales AS (SELECT id,medio_pago medio,monto FROM public.pagos_venta WHERE pagos_venta.venta_id=v.id)
    SELECT 1 FROM historicos FULL JOIN actuales USING(id)
      WHERE historicos.medio IS DISTINCT FROM actuales.medio OR historicos.monto IS DISTINCT FROM actuales.monto)
    OR (SELECT sum(monto) FROM public.pagos_venta WHERE pagos_venta.venta_id=v.id) IS DISTINCT FROM v.total THEN
    RAISE EXCEPTION 'Pagos históricos inconsistentes' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('detalle_id',detalle_id,'cantidad',cantidad)),'[]'::jsonb)
    INTO previos FROM (
      SELECT e->>'detalle_id' detalle_id,sum((e->>'cantidad')::numeric) cantidad
      FROM public.devoluciones_parciales_atomicas a CROSS JOIN LATERAL jsonb_array_elements(a.resultado->'detalles') e
      WHERE a.venta_id=v.id AND a.kiosco_id=v.kiosco_id GROUP BY 1
    ) acumulados;
  PERFORM public.exigir_capacidad_operativa_piloto(actor.kiosco_id,'ENVASES');
  IF EXISTS(SELECT 1 FROM public.devoluciones_venta WHERE venta_id=v.id)
    OR EXISTS(SELECT 1 FROM public.devoluciones_parciales_atomicas WHERE venta_id=v.id) THEN
    RAISE EXCEPTION 'El ticket con envases requiere devolución completa sin devoluciones previas' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.envases_checkout_operaciones e WHERE e.checkout_id=v.id AND e.kiosco_id=v.kiosco_id AND e.snapshot=op.solicitud) THEN
    RAISE EXCEPTION 'Falta ledger inmutable de recepción de envases' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_agg(d ORDER BY d->>'id'),sum((d->>'subtotal')::numeric) INTO mercaderia,base_importe
    FROM jsonb_array_elements(op.solicitud->'detalles') d WHERE NOT coalesce((d->>'es_devolucion_envase')::boolean,false);
  SELECT -sum((d->>'subtotal')::numeric) INTO credito FROM jsonb_array_elements(op.solicitud->'detalles') d WHERE (d->>'es_devolucion_envase')::boolean;
  IF credito IS NULL OR credito<=0 OR base_importe IS DISTINCT FROM v.total+credito OR v.total<=0 THEN
    RAISE EXCEPTION 'Crédito histórico de envases inconsistente';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(mercaderia) d WHERE NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_solicitud->'items') i WHERE i->>'detalleId'=d->>'id' AND (i->>'cantidad')::numeric=(d->>'cantidad')::numeric))
    OR jsonb_array_length(p_solicitud->'items')<>jsonb_array_length(mercaderia) THEN
    RAISE EXCEPTION 'El ticket con envases debe devolverse completo' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('tipo_id',tipo_id,'cantidad',cantidad,'importe',importe) ORDER BY tipo_id) INTO envases
    FROM (SELECT m.tipo_id,sum(m.cantidad) cantidad,sum(m.importe) importe FROM public.envases_movimientos m
      JOIN public.envases_operaciones e ON e.id=m.id AND e.kiosco_id=m.kiosco_id
      WHERE m.kiosco_id=v.kiosco_id AND m.accion='RECIBIR_TICKET' AND e.solicitud->>'checkout_id'=v.id::text GROUP BY m.tipo_id) r;
  IF envases IS NULL OR (SELECT sum((e->>'importe')::numeric) FROM jsonb_array_elements(envases) e) IS DISTINCT FROM credito THEN
    RAISE EXCEPTION 'Movimientos históricos de envases inconsistentes';
  END IF;
  plan:=public.preparar_reintegros_historicos(v.total,mercaderia,p_solicitud->'items','[]'::jsonb);
  RETURN jsonb_build_object('confirmada',false,'actor_id',actor.id,'actor_auth_id',auth.uid(),
    'kiosco_id',v.kiosco_id,'venta_id',v.id,'snapshot',op.solicitud,'detalles',plan,'credito_envases',credito,'recepciones_envases',envases);
END $$;
REVOKE ALL ON FUNCTION public.preparar_devolucion_envases_piloto(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;

-- Called only inside the cash return transaction, after its cash-session lock.
CREATE OR REPLACE FUNCTION public.aplicar_envases_devolucion_piloto(p_plan jsonb,p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r jsonb; kid uuid:=(p_plan->>'kiosco_id')::uuid; saldo integer; confirmado integer;
  actor uuid:=(p_plan->>'actor_id')::uuid; op uuid; filas integer; entregas jsonb:='[]'::jsonb;
BEGIN
  IF p_solicitud->>'modalidadEnvases'='ENTREGAR_ENVASES' THEN
    FOR r IN SELECT value FROM jsonb_array_elements(p_plan->'recepciones_envases') ORDER BY value->>'tipo_id' LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('envases-tipo:'||kid::text||':'||(r->>'tipo_id'),0));
      PERFORM 1 FROM public.envases_tipos_comercio t WHERE t.kiosco_id=kid AND t.id=r->>'tipo_id' FOR UPDATE;
      SELECT s.cantidad INTO saldo FROM public.envases_saldos s WHERE s.kiosco_id=kid AND s.tipo_id=r->>'tipo_id' FOR UPDATE;
      IF NOT FOUND OR saldo<(r->>'cantidad')::integer THEN RAISE EXCEPTION 'No hay suficientes envases vacíos para entregar al cliente' USING ERRCODE='22023'; END IF;
      UPDATE public.envases_saldos s SET cantidad=s.cantidad-(r->>'cantidad')::integer,actualizado_en=now()
        WHERE s.kiosco_id=kid AND s.tipo_id=r->>'tipo_id' RETURNING s.cantidad INTO confirmado;
      IF NOT FOUND OR confirmado IS DISTINCT FROM saldo-(r->>'cantidad')::integer THEN RAISE EXCEPTION 'No se confirmó la entrega de envases'; END IF;
      op:=gen_random_uuid();
      INSERT INTO public.envases_operaciones(id,kiosco_id,actor_auth_id,solicitud,resultado)
        VALUES(op,kid,auth.uid(),jsonb_build_object('id',op,'accion','DEVOLVER_CLIENTE','devolucion_id',p_solicitud->>'id','tipoId',r->>'tipo_id'),
          jsonb_build_object('id',op,'stock_vacios',confirmado,'importe',0));
      GET DIAGNOSTICS filas=ROW_COUNT; IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el ledger de entrega'; END IF;
      INSERT INTO public.envases_movimientos(id,kiosco_id,tipo_id,usuario_id,accion,cantidad,stock_resultante,importe,notas)
        VALUES(op,kid,r->>'tipo_id',actor,'DEVOLVER_CLIENTE',-(r->>'cantidad')::integer,confirmado,0,'Devolución de ticket '||(p_plan->>'venta_id'));
      GET DIAGNOSTICS filas=ROW_COUNT; IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el movimiento de entrega'; END IF;
      entregas:=entregas||jsonb_build_array(jsonb_build_object('tipo_id',r->>'tipo_id','cantidad',(r->>'cantidad')::integer,'stock_vacios',confirmado));
    END LOOP;
  END IF;
  RETURN jsonb_build_object('modalidad',p_solicitud->>'modalidadEnvases','credito',p_plan->'credito_envases','entregas',entregas);
END $$;
REVOKE ALL ON FUNCTION public.aplicar_envases_devolucion_piloto(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
