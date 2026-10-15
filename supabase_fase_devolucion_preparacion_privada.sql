-- Preparación privada para futura RPC atómica; no habilita una devolución.
-- Requiere registro privado y cálculo histórico. Los bloqueos duran la TX llamadora.
BEGIN;
CREATE OR REPLACE FUNCTION public.preparar_devolucion_parcial_privada(p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor public.usuarios%ROWTYPE; v public.ventas%ROWTYPE; op public.checkout_manuales%ROWTYPE;
  anterior public.devoluciones_parciales_atomicas%ROWTYPE;
  solicitud_id uuid; v_venta_id uuid; previos jsonb; plan jsonb; item jsonb;
BEGIN
  BEGIN
    SELECT * INTO STRICT actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Identidad de devolución no autorizada' USING ERRCODE='42501';
  END;
  IF actor.rol NOT IN ('DUEÑO','CAJERO') OR actor.rol IS NULL THEN
    RAISE EXCEPTION 'Rol de devolución no autorizado' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.kioscos WHERE id=actor.kiosco_id AND estado_suscripcion='ACTIVO' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio no habilitado' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_solicitud) IS DISTINCT FROM 'object'
    OR NOT (p_solicitud ?& ARRAY['version','id','ventaId','metodo','motivo','notas','sesionReintegroId','items']::text[])
    OR p_solicitud - ARRAY['version','id','ventaId','metodo','motivo','notas','sesionReintegroId','items']::text[] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Solicitud de devolución inválida' USING ERRCODE='22023';
  END IF;
  IF p_solicitud->'version' IS DISTINCT FROM '1'::jsonb
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
  plan:=public.preparar_reintegros_historicos(v.total,op.solicitud->'detalles',p_solicitud->'items',previos);
  RETURN jsonb_build_object('confirmada',false,'actor_id',actor.id,'actor_auth_id',auth.uid(),
    'kiosco_id',v.kiosco_id,'venta_id',v.id,'snapshot',op.solicitud,'detalles',plan);
END $$;
REVOKE ALL ON FUNCTION public.preparar_devolucion_parcial_privada(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
