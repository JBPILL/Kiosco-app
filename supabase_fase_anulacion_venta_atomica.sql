-- Fase 51. Requiere checkout manual, auditoría de anulaciones y devoluciones.
BEGIN;
CREATE TABLE IF NOT EXISTS public.anulaciones_venta_atomicas (
  venta_id uuid PRIMARY KEY REFERENCES public.ventas(id),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  actor_auth_id uuid NOT NULL,
  motivo text NOT NULL,
  resultado jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.anulaciones_venta_atomicas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.anulaciones_venta_atomicas FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.anulaciones_venta_atomicas TO authenticated;
DROP POLICY IF EXISTS anulaciones_atomicas_dueno ON public.anulaciones_venta_atomicas;
CREATE POLICY anulaciones_atomicas_dueno ON public.anulaciones_venta_atomicas FOR SELECT TO authenticated
  USING(kiosco_id=public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin());

CREATE OR REPLACE FUNCTION public.anular_venta_atomica(p_venta_id uuid,p_motivo text,p_sesion_reintegro uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor public.usuarios%ROWTYPE; v public.ventas%ROWTYPE; op public.checkout_manuales%ROWTYPE;
  anterior public.anulaciones_venta_atomicas%ROWTYPE; registro record; stocks jsonb:='[]'::jsonb;
  fisicos jsonb; efectivo numeric; credito numeric; saldo numeric; caja_destino uuid; original_abierta boolean;
  v_cliente_id uuid; resultado jsonb; v_motivo text:=btrim(p_motivo); nuevo_stock numeric;
  esperado numeric; lote_anterior numeric; lote_despues numeric; filas integer;
BEGIN
  BEGIN
    SELECT * INTO STRICT actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Se requiere un único dueño activo.' USING ERRCODE='42501';
  END;
  IF actor.rol IS DISTINCT FROM 'DUEÑO' THEN RAISE EXCEPTION 'Solo el dueño puede anular.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.kioscos WHERE id=actor.kiosco_id AND estado_suscripcion='ACTIVO' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio no habilitado.' USING ERRCODE='42501'; END IF;
  -- Mismo orden que el cierre: operación y luego cabecera.
  SELECT * INTO op FROM public.checkout_manuales WHERE venta_id=p_venta_id AND kiosco_id=actor.kiosco_id FOR UPDATE;
  IF NOT FOUND OR op.resultado IS NULL THEN
    RAISE EXCEPTION 'Esta venta no tiene un cierre histórico verificable; requiere conciliación antes de anular.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v FROM public.ventas WHERE id=p_venta_id AND kiosco_id=actor.kiosco_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no disponible.' USING ERRCODE='42501'; END IF;
  SELECT * INTO anterior FROM public.anulaciones_venta_atomicas WHERE venta_id=v.id;
  IF FOUND THEN
    IF v.estado IS DISTINCT FROM 'ANULADA' THEN RAISE EXCEPTION 'Anulación inconsistente; requiere conciliación.'; END IF;
    RETURN anterior.resultado;
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 5 AND 300 THEN RAISE EXCEPTION 'Motivo inválido.' USING ERRCODE='22023'; END IF;
  IF v.estado IS DISTINCT FROM 'COMPLETADA' OR v.total IS DISTINCT FROM (op.solicitud->>'total')::numeric THEN
    RAISE EXCEPTION 'Venta o importe histórico inconsistente.' USING ERRCODE='22023';
  END IF;
  IF NULLIF(to_jsonb(v)->>'afip_cae','') IS NOT NULL THEN
    RAISE EXCEPTION 'La venta tiene comprobante fiscal; requiere su circuito de nota de crédito.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.devoluciones_venta WHERE venta_id=v.id) THEN
    RAISE EXCEPTION 'La venta ya tiene devoluciones parciales.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(WITH originales AS (SELECT e->>'medio_pago' medio,sum((e->>'monto')::numeric) monto
      FROM jsonb_array_elements(op.solicitud->'pagos') e GROUP BY 1),
    actuales AS (SELECT medio_pago medio,sum(monto) monto FROM public.pagos_venta WHERE venta_id=v.id GROUP BY 1)
    SELECT 1 FROM originales FULL JOIN actuales USING(medio) WHERE originales.monto IS DISTINCT FROM actuales.monto) THEN
    RAISE EXCEPTION 'Pagos históricos inconsistentes.' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(sum(monto) FILTER(WHERE medio_pago='EFECTIVO'),0),
    coalesce(sum(monto) FILTER(WHERE medio_pago='CUENTA_CORRIENTE'),0) INTO efectivo,credito
    FROM public.pagos_venta WHERE venta_id=v.id;
  IF credito>0 THEN
    v_cliente_id:=(op.solicitud->>'cliente_id')::uuid;
    IF v_cliente_id IS NULL OR (SELECT sum(monto) FROM public.movimientos_cuenta_corriente
      WHERE venta_id=v.id AND kiosco_id=v.kiosco_id AND cliente_id=v_cliente_id AND tipo='CARGO_VENTA') IS DISTINCT FROM credito THEN
      RAISE EXCEPTION 'Cargo histórico de cuenta corriente inconsistente.' USING ERRCODE='22023';
    END IF;
  END IF;
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO fisicos FROM (
    SELECT jsonb_build_object('producto_id',componentes->>'producto_id',
      'cantidad',(d->>'cantidad')::numeric*(componentes->>'cantidad')::numeric) x
    FROM jsonb_array_elements(op.solicitud->'detalles') d
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_array_length(d->'componentes')>0 THEN d->'componentes'
      ELSE jsonb_build_array(jsonb_build_object('producto_id',d->>'producto_id','cantidad',1)) END) componentes
    WHERE NOT (d->>'es_devolucion_envase')::boolean AND (d->'articulo_libre'='null'::jsonb OR NOT d?'articulo_libre')
  ) cantidades;
  -- Las salidas FEFO históricas deben cubrir exactamente la composición vendida.
  IF EXISTS(WITH esperados AS (SELECT (e->>'producto_id')::uuid producto_id,sum((e->>'cantidad')::numeric) cantidad
      FROM jsonb_array_elements(fisicos) e GROUP BY 1),
    movimientos AS (SELECT producto_id,sum(cantidad) cantidad FROM public.movimientos_stock
      WHERE kiosco_id=v.kiosco_id AND tipo='EGRESO' AND motivo='VENTA' AND notas='Checkout manual '||v.id::text GROUP BY 1)
    SELECT 1 FROM esperados FULL JOIN movimientos USING(producto_id) WHERE esperados.cantidad IS DISTINCT FROM movimientos.cantidad) THEN
    RAISE EXCEPTION 'Stock histórico inconsistente; requiere conciliación.' USING ERRCODE='22023';
  END IF;
  -- Serializar caja, productos, lotes y cliente antes de cambiar cualquier importe.
  PERFORM 1 FROM public.sesiones_caja WHERE id IN (v.sesion_caja_id,p_sesion_reintegro) ORDER BY id FOR UPDATE;
  SELECT estado='ABIERTA' AND fecha_cierre IS NULL INTO original_abierta FROM public.sesiones_caja
    WHERE id=v.sesion_caja_id AND kiosco_id=v.kiosco_id;
  IF efectivo>0 THEN
    caja_destino:=CASE WHEN original_abierta THEN v.sesion_caja_id ELSE p_sesion_reintegro END;
    IF original_abierta AND p_sesion_reintegro IS NOT NULL AND p_sesion_reintegro<>v.sesion_caja_id THEN
      RAISE EXCEPTION 'El reintegro corresponde a la caja original abierta.' USING ERRCODE='22023';
    END IF;
    PERFORM 1 FROM public.sesiones_caja WHERE id=caja_destino AND kiosco_id=v.kiosco_id AND estado='ABIERTA' AND fecha_cierre IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seleccioná una caja abierta para el reintegro.' USING ERRCODE='22023'; END IF;
  END IF;
  FOR registro IN SELECT (e->>'producto_id')::uuid id,sum((e->>'cantidad')::numeric) cantidad
    FROM jsonb_array_elements(fisicos) e GROUP BY 1 ORDER BY 1 LOOP
    SELECT stock_actual INTO nuevo_stock FROM public.productos WHERE id=registro.id AND kiosco_id=v.kiosco_id FOR UPDATE;
    IF NOT FOUND OR nuevo_stock IS NULL OR nuevo_stock::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Producto histórico no disponible.' USING ERRCODE='22023';
    END IF;
    esperado:=nuevo_stock+registro.cantidad;
    UPDATE public.productos SET stock_actual=stock_actual+registro.cantidad,fecha_actualizacion=now() WHERE id=registro.id RETURNING stock_actual INTO nuevo_stock;
    IF NOT FOUND OR nuevo_stock IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'No se confirmó el stock restituido.'; END IF;
    stocks:=stocks||jsonb_build_array(jsonb_build_object('producto_id',registro.id,'stock_actual',nuevo_stock));
  END LOOP;
  FOR registro IN SELECT * FROM public.movimientos_stock WHERE kiosco_id=v.kiosco_id AND tipo='EGRESO'
    AND motivo='VENTA' AND notas='Checkout manual '||v.id::text ORDER BY lote_producto_id,id LOOP
    IF registro.cantidad<=0 THEN RAISE EXCEPTION 'Salida histórica inválida.' USING ERRCODE='22023'; END IF;
    IF registro.lote_producto_id IS NOT NULL THEN
      SELECT cantidad_actual INTO lote_anterior FROM public.lotes_producto WHERE id=registro.lote_producto_id
        AND producto_id=registro.producto_id AND kiosco_id=v.kiosco_id FOR UPDATE;
      IF NOT FOUND OR lote_anterior IS NULL OR lote_anterior<0 OR lote_anterior::text IN ('NaN','Infinity','-Infinity') THEN
        RAISE EXCEPTION 'Lote histórico no disponible.' USING ERRCODE='22023'; END IF;
      UPDATE public.lotes_producto SET cantidad_actual=cantidad_actual+registro.cantidad,
        activo=CASE WHEN cantidad_actual=0 THEN true ELSE activo END
        WHERE id=registro.lote_producto_id RETURNING cantidad_actual INTO lote_despues;
      IF NOT FOUND OR lote_despues IS DISTINCT FROM lote_anterior+registro.cantidad THEN RAISE EXCEPTION 'No se confirmó el lote restituido.'; END IF;
    END IF;
    INSERT INTO public.movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas,usuario_id,fecha,lote_producto_id)
      VALUES(v.kiosco_id,registro.producto_id,'INGRESO',registro.cantidad,'DEVOLUCION','Anulación atómica '||v.id::text,
        actor.id,now(),registro.lote_producto_id);
    GET DIAGNOSTICS filas=ROW_COUNT;
    IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el movimiento de stock.'; END IF;
  END LOOP;
  IF credito>0 THEN
    SELECT saldo_deudor INTO saldo FROM public.clientes WHERE id=v_cliente_id AND kiosco_id=v.kiosco_id FOR UPDATE;
    IF NOT FOUND OR saldo IS NULL OR saldo::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Cuenta corriente no disponible.'; END IF;
    esperado:=saldo-credito;
    UPDATE public.clientes SET saldo_deudor=saldo_deudor-credito WHERE id=v_cliente_id RETURNING saldo_deudor INTO saldo;
    IF NOT FOUND OR saldo IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'No se confirmó la reversión de deuda.'; END IF;
    INSERT INTO public.movimientos_cuenta_corriente(cliente_id,kiosco_id,venta_id,tipo,monto,saldo_resultante,usuario_id,notas,fecha_hora)
      VALUES(v_cliente_id,v.kiosco_id,v.id,'ABONO_PAGO',credito,saldo,actor.id,'Anulación atómica '||v.id::text,now());
    GET DIAGNOSTICS filas=ROW_COUNT;
    IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el movimiento de cuenta corriente.'; END IF;
  END IF;
  -- En la caja original abierta, excluir la venta ya resta el efectivo del arqueo.
  -- Sólo otra caja registra egreso: así no se descuenta dos veces el mismo reintegro.
  IF efectivo>0 AND NOT coalesce(original_abierta,false) THEN
    INSERT INTO public.movimientos_caja(kiosco_id,sesion_caja_id,usuario_id,tipo,motivo,monto,descripcion,fecha_hora)
      VALUES(v.kiosco_id,caja_destino,actor.id,'EGRESO','DEVOLUCION_VENTA',efectivo,'Anulación atómica '||v.id::text,now());
    GET DIAGNOSTICS filas=ROW_COUNT;
    IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el reintegro de caja.'; END IF;
  END IF;
  resultado:=jsonb_build_object('venta_id',v.id,'kiosco_id',v.kiosco_id,'estado','ANULADA','stock',stocks,
    'saldo_cliente',saldo,'reintegro_efectivo',efectivo,'sesion_reintegro',caja_destino);
  INSERT INTO public.anulaciones_venta_atomicas(venta_id,kiosco_id,actor_auth_id,motivo,resultado)
    VALUES(v.id,v.kiosco_id,auth.uid(),v_motivo,resultado);
  UPDATE public.ventas SET estado='ANULADA',motivo_anulacion=v_motivo WHERE id=v.id;
  IF NOT EXISTS(SELECT 1 FROM public.ventas WHERE id=v.id AND estado='ANULADA') THEN RAISE EXCEPTION 'No se confirmó la anulación.'; END IF;
  RETURN resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.anular_venta_atomica(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.anular_venta_atomica(uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.proteger_anulacion_atomica() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.estado='ANULADA' AND OLD.estado IS DISTINCT FROM 'ANULADA' AND NOT EXISTS(
    SELECT 1 FROM public.anulaciones_venta_atomicas WHERE venta_id=OLD.id AND kiosco_id=OLD.kiosco_id AND actor_auth_id=auth.uid()) THEN
    RAISE EXCEPTION 'Usá la operación de anulación atómica.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_anulacion_atomica() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS trg_proteger_anulacion_atomica ON public.ventas;
CREATE TRIGGER trg_proteger_anulacion_atomica BEFORE UPDATE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.proteger_anulacion_atomica();
-- Evita que una devolución aparezca entre la comprobación y el commit de anulación.
CREATE OR REPLACE FUNCTION public.proteger_devolucion_venta_vigente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF (SELECT count(*) FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo)<>1
    OR NOT EXISTS(SELECT 1 FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo AND kiosco_id=NEW.kiosco_id AND rol IN ('DUEÑO','CAJERO')) THEN
    RAISE EXCEPTION 'Devolución no autorizada.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.venta_id IS DISTINCT FROM OLD.venta_id
    OR NEW.kiosco_id IS DISTINCT FROM OLD.kiosco_id) THEN RAISE EXCEPTION 'La identidad de la devolución es inmutable.'; END IF;
  PERFORM 1 FROM public.ventas WHERE id=NEW.venta_id AND kiosco_id=NEW.kiosco_id AND estado='COMPLETADA' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La venta no admite devoluciones.' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_devolucion_venta_vigente() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS trg_devolucion_venta_vigente ON public.devoluciones_venta;
CREATE TRIGGER trg_devolucion_venta_vigente BEFORE INSERT OR UPDATE ON public.devoluciones_venta
  FOR EACH ROW EXECUTE FUNCTION public.proteger_devolucion_venta_vigente();
NOTIFY pgrst,'reload schema';
COMMIT;
