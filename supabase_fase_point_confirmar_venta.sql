-- Después de reservas Point, costos privados y costos de movimientos.
-- Sólo confirma pagos ya verificados por el procesador; no habilita el POS Point.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.producto_costos') IS NULL OR to_regclass('public.movimiento_stock_costos') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.movimientos_stock'::regclass
      AND tgname='trg_guardar_costo_privado_movimiento_stock' AND NOT tgisinternal AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'Aplicar primero costos privados y costos de movimientos';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS point_venta_unica ON public.point_intentos(venta_id) WHERE venta_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.proteger_venta_point()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF (OLD.venta_id IS NOT NULL AND NEW.venta_id IS DISTINCT FROM OLD.venta_id)
    OR (NEW.venta_id IS NOT NULL AND NEW.venta_id IS DISTINCT FROM NEW.checkout_id) THEN
    RAISE EXCEPTION 'No se puede cambiar la venta del intento Point';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_venta_point() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS proteger_venta_point ON public.point_intentos;
CREATE TRIGGER proteger_venta_point BEFORE UPDATE OF venta_id ON public.point_intentos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_venta_point();

CREATE OR REPLACE FUNCTION public.confirmar_venta_point(p_intento_id uuid,p_kiosco_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_intento public.point_intentos%ROWTYPE; v_venta public.ventas%ROWTYPE;
  v_items jsonb; v_lineas jsonb; v_pagos jsonb; v_plan jsonb;
  v_item jsonb; v_linea jsonb; v_pago jsonb; v_producto uuid; v_usuario uuid; v_caja uuid;
  v_total numeric; v_base numeric; v_suma_pagos numeric := 0; v_credito numeric := 0;
  v_stock record; v_lote record; v_cliente uuid; v_saldo numeric;
  v_cantidad numeric; v_importe numeric; v_tipo text; v_indice integer := 0; v_consumido numeric;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN
    RAISE EXCEPTION 'Se requiere el servidor de pagos' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_intento FROM public.point_intentos
    WHERE id=p_intento_id AND kiosco_id=p_kiosco_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no disponible'; END IF;
  -- La identidad del checkout es también la identidad de la venta.
  IF v_intento.estado='VENTA_CONFIRMADA' THEN
    SELECT * INTO v_venta FROM public.ventas WHERE id=v_intento.venta_id;
    IF NOT FOUND OR v_intento.venta_id IS DISTINCT FROM v_intento.checkout_id
      OR v_venta.kiosco_id IS DISTINCT FROM p_kiosco_id
      OR v_venta.total IS DISTINCT FROM (v_intento.solicitud#>>'{cotizacion,ticket,total}')::numeric
      OR v_venta.sesion_caja_id IS DISTINCT FROM (v_intento.solicitud->>'sesionCajaId')::uuid
      OR v_venta.usuario_id IS DISTINCT FROM (v_intento.solicitud->>'usuarioId')::uuid THEN
      RAISE EXCEPTION 'Vinculación de venta inconsistente';
    END IF;
    RETURN v_venta.id;
  END IF;
  IF v_intento.estado<>'PAGO_CONFIRMADO' OR v_intento.venta_id IS NOT NULL
    OR coalesce(v_intento.order_id,'') !~ '^ORD[A-Za-z0-9]{1,100}$'
    OR coalesce(v_intento.payment_id,'') !~ '^PAY[A-Za-z0-9]{1,100}$'
    OR v_intento.stock_reservado_at IS NULL OR v_intento.lotes_reservados_at IS NULL
    OR v_intento.credito_reservado_at IS NULL THEN
    RAISE EXCEPTION 'El pago o sus reservas requieren conciliación';
  END IF;
  IF v_intento.solicitud->>'version' IS DISTINCT FROM '2'
    OR v_intento.solicitud#>>'{entrada,intentoId}' IS DISTINCT FROM p_intento_id::text
    OR v_intento.solicitud#>>'{entrada,checkoutId}' IS DISTINCT FROM v_intento.checkout_id::text THEN
    RAISE EXCEPTION 'Identidad del snapshot inválida';
  END IF;
  v_usuario:=(v_intento.solicitud->>'usuarioId')::uuid;
  v_caja:=(v_intento.solicitud->>'sesionCajaId')::uuid;
  PERFORM 1 FROM public.usuarios WHERE id=v_usuario AND kiosco_id=p_kiosco_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario original no disponible'; END IF;
  PERFORM 1 FROM public.sesiones_caja WHERE id=v_caja AND kiosco_id=p_kiosco_id
    AND usuario_id=v_usuario AND estado='ABIERTA' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja original no disponible'; END IF;
  v_total:=(v_intento.solicitud#>>'{cotizacion,ticket,total}')::numeric;
  IF v_total IS NULL OR v_total<=0 OR v_total<>trunc(v_total) OR v_total>9999999999
    OR v_total::text IN ('NaN','Infinity','-Infinity')
    OR (v_intento.solicitud#>>'{cotizacion,ticket,montoCentavos}')::numeric IS DISTINCT FROM v_total*100
    OR (v_intento.solicitud#>>'{cotizacion,cobro,montoPointCentavos}')::numeric IS DISTINCT FROM v_intento.monto_centavos THEN
    RAISE EXCEPTION 'Total congelado inválido';
  END IF;
  v_items:=v_intento.solicitud#>'{cotizacion,ticket,items}';
  v_lineas:=v_intento.solicitud#>'{entrada,lineas}';
  v_pagos:=v_intento.solicitud#>'{entrada,pagos}';
  v_plan:=v_intento.solicitud#>'{cotizacion,ticket,consumoStock}';
  IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' OR jsonb_typeof(v_lineas) IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_pagos) IS DISTINCT FROM 'array' OR jsonb_typeof(v_plan) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Colecciones del snapshot inválidas';
  END IF;
  IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 500
    OR jsonb_array_length(v_items)<>jsonb_array_length(v_lineas) OR jsonb_array_length(v_pagos)>20 THEN
    RAISE EXCEPTION 'Cantidad de líneas inválida';
  END IF;
  FOR v_pago IN SELECT value FROM jsonb_array_elements(v_pagos) LOOP
    v_importe:=(v_pago->>'montoCentavos')::numeric;
    IF v_importe IS NULL OR v_importe<=0 OR v_importe<>trunc(v_importe)
      OR v_importe>9007199254740991 OR v_importe::text IN ('NaN','Infinity','-Infinity')
      OR coalesce(v_pago->>'medio','') NOT IN ('EFECTIVO','TRANSFERENCIA','TARJETA','MERCADOPAGO','CUENTA_CORRIENTE')
      OR coalesce(v_pago->>'id','') !~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Pago complementario inválido';
    END IF;
    v_suma_pagos:=v_suma_pagos+v_importe;
    IF v_pago->>'medio'='CUENTA_CORRIENTE' THEN v_credito:=v_credito+v_importe; END IF;
  END LOOP;
  IF v_suma_pagos+v_intento.monto_centavos<>v_total*100
    OR v_credito IS DISTINCT FROM (v_intento.solicitud#>>'{cotizacion,cobro,montoCuentaCorrienteCentavos}')::numeric
    OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(v_pagos))<>jsonb_array_length(v_pagos) THEN
    RAISE EXCEPTION 'División de pagos inconsistente';
  END IF;
  -- Comparación bidireccional: no consumir una reserva ajena al plan congelado.
  IF EXISTS (
    (SELECT (value->>'productoId')::uuid,(value->>'cantidad')::numeric FROM jsonb_array_elements(v_plan)
      EXCEPT SELECT producto_id,cantidad FROM public.point_reservas_stock WHERE intento_id=p_intento_id)
    UNION ALL
    (SELECT producto_id,cantidad FROM public.point_reservas_stock WHERE intento_id=p_intento_id
      EXCEPT SELECT (value->>'productoId')::uuid,(value->>'cantidad')::numeric FROM jsonb_array_elements(v_plan))
  ) OR (SELECT count(DISTINCT value->>'productoId') FROM jsonb_array_elements(v_plan))<>jsonb_array_length(v_plan) THEN
    RAISE EXCEPTION 'Reservas físicas inconsistentes';
  END IF;
  -- Orden común con las reservas: caja -> productos -> lotes -> cliente.
  FOR v_stock IN SELECT * FROM public.point_reservas_stock WHERE intento_id=p_intento_id ORDER BY producto_id LOOP
    PERFORM 1 FROM public.productos WHERE id=v_stock.producto_id AND kiosco_id=p_kiosco_id
      AND activo AND NOT coalesce(es_combo,false) AND stock_actual>=v_stock.cantidad
      AND stock_actual::text NOT IN ('NaN','Infinity','-Infinity') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stock reservado no disponible'; END IF;
    FOR v_lote IN SELECT l.id,l.cantidad_actual,l.activo,r.cantidad FROM public.point_reservas_lotes r
      JOIN public.lotes_producto l ON l.id=r.lote_id
      WHERE r.intento_id=p_intento_id AND l.producto_id=v_stock.producto_id AND l.kiosco_id=p_kiosco_id
      ORDER BY l.fecha_vencimiento,l.fecha_ingreso,l.id FOR UPDATE OF l LOOP
      IF NOT coalesce(v_lote.activo,false) OR v_lote.cantidad_actual IS NULL OR v_lote.cantidad_actual<v_lote.cantidad
        OR v_lote.cantidad_actual::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Lote reservado no disponible'; END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.point_reservas_lotes r JOIN public.lotes_producto l ON l.id=r.lote_id
    LEFT JOIN public.point_reservas_stock s ON s.intento_id=r.intento_id AND s.producto_id=l.producto_id
    WHERE r.intento_id=p_intento_id AND (s.producto_id IS NULL OR l.kiosco_id<>p_kiosco_id))
    OR EXISTS (SELECT l.producto_id FROM public.point_reservas_lotes r JOIN public.lotes_producto l ON l.id=r.lote_id
      JOIN public.point_reservas_stock s ON s.intento_id=r.intento_id AND s.producto_id=l.producto_id
      WHERE r.intento_id=p_intento_id GROUP BY l.producto_id,s.cantidad HAVING sum(r.cantidad)>s.cantidad) THEN
    RAISE EXCEPTION 'Reservas de lotes inconsistentes';
  END IF;
  IF v_credito>0 THEN
    v_cliente:=(v_intento.solicitud#>>'{entrada,clienteId}')::uuid;
    PERFORM 1 FROM public.point_reservas_credito WHERE intento_id=p_intento_id
      AND cliente_id=v_cliente AND monto_centavos=v_credito;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reserva de crédito inconsistente'; END IF;
    SELECT saldo_deudor INTO v_saldo FROM public.clientes WHERE id=v_cliente
      AND kiosco_id=p_kiosco_id AND activo FOR UPDATE;
    IF NOT FOUND OR v_saldo IS NULL OR v_saldo::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Cliente original no disponible';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.point_reservas_credito WHERE intento_id=p_intento_id) THEN
    RAISE EXCEPTION 'Reserva de crédito inesperada';
  END IF;
  SELECT sum((value->>'subtotal')::numeric) INTO v_base FROM jsonb_array_elements(v_items);
  IF v_base IS NULL OR v_base<=0 OR v_base::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Base de detalle inválida'; END IF;
  -- Los conceptos virtuales se insertan antes de sus FK; nunca sobrescribir catálogo.
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_linea:=v_lineas->v_indice; v_indice:=v_indice+1;
    v_tipo:=v_linea->>'tipo'; v_producto:=(v_item#>>'{producto,id}')::uuid;
    v_cantidad:=(v_item->>'cantidad')::numeric; v_importe:=(v_item->>'subtotal')::numeric;
    IF v_cantidad IS NULL OR v_cantidad<=0 OR v_cantidad<>round(v_cantidad,3) OR v_cantidad>999999
      OR v_cantidad IS DISTINCT FROM (v_linea->>'cantidad')::numeric
      OR v_importe IS NULL OR v_importe::text IN ('NaN','Infinity','-Infinity')
      OR v_item#>>'{producto,kiosco_id}' IS DISTINCT FROM p_kiosco_id::text THEN
      RAISE EXCEPTION 'Detalle congelado inválido';
    END IF;
    IF v_tipo='PRODUCTO' THEN
      IF v_producto IS DISTINCT FROM (v_linea->>'productoId')::uuid OR coalesce((v_item->>'es_devolucion_envase')::boolean,false) THEN
        RAISE EXCEPTION 'Identidad del artículo inválida';
      END IF;
      PERFORM 1 FROM public.productos WHERE id=v_producto AND kiosco_id=p_kiosco_id AND activo FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Artículo original no disponible'; END IF;
    ELSIF v_tipo IN ('SERVICIO','DEVOLUCION_ENVASE') THEN
      IF v_producto IS DISTINCT FROM (v_linea->>'id')::uuid
        OR coalesce((v_item->>'es_devolucion_envase')::boolean,false) IS DISTINCT FROM (v_tipo='DEVOLUCION_ENVASE')
        OR length(coalesce(v_item#>>'{producto,descripcion}','')) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'Concepto virtual inválido';
      END IF;
      INSERT INTO public.productos(id,kiosco_id,descripcion,precio_venta,precio_costo,stock_actual,activo)
        VALUES(v_producto,p_kiosco_id,v_item#>>'{producto,descripcion}',
          greatest(0,(v_item#>>'{producto,precio_venta}')::numeric),0,0,false);
    ELSE RAISE EXCEPTION 'Tipo de detalle inválido'; END IF;
  END LOOP;
  INSERT INTO public.ventas(id,kiosco_id,usuario_id,sesion_caja_id,total,estado,notas)
    VALUES(v_intento.checkout_id,p_kiosco_id,v_usuario,v_caja,v_total,'COMPLETADA','Pago Point: '||v_intento.payment_id);
  -- Mayor resto en pesos enteros, incluyendo reintegros negativos.
  WITH cuotas AS (
    SELECT value AS item,ordinality AS posicion,(value->>'subtotal')::numeric/v_base*v_total AS cuota
    FROM jsonb_array_elements(v_items) WITH ORDINALITY
  ), reparto AS (
    SELECT *,floor(cuota) AS piso,row_number() OVER(ORDER BY cuota-floor(cuota) DESC,posicion) AS orden,
      v_total-sum(floor(cuota)) OVER() AS resto FROM cuotas
  ), finales AS (
    SELECT *,piso+CASE WHEN orden<=resto THEN 1 ELSE 0 END AS importe FROM reparto
  )
  INSERT INTO public.detalles_venta(venta_id,producto_id,cantidad,precio_unitario,subtotal,
    sin_envase,precio_envase_unitario,es_devolucion_envase)
    SELECT v_intento.checkout_id,(item#>>'{producto,id}')::uuid,(item->>'cantidad')::numeric,
      greatest(0,round(importe/(item->>'cantidad')::numeric,2)),importe,
      coalesce((item->>'sin_envase')::boolean,false),coalesce((item->>'precio_envase_unitario')::numeric,0),
      coalesce((item->>'es_devolucion_envase')::boolean,false) FROM finales;
  IF (SELECT sum(subtotal) FROM public.detalles_venta WHERE venta_id=v_intento.checkout_id)<>v_total THEN
    RAISE EXCEPTION 'Redondeo del detalle inconsistente';
  END IF;
  INSERT INTO public.pagos_venta(venta_id,medio_pago,monto,referencia)
    VALUES(v_intento.checkout_id,'MERCADOPAGO',v_intento.monto_centavos/100.0,v_intento.payment_id);
  INSERT INTO public.pagos_venta(id,venta_id,medio_pago,monto)
    SELECT (value->>'id')::uuid,v_intento.checkout_id,value->>'medio',(value->>'montoCentavos')::numeric/100
    FROM jsonb_array_elements(v_pagos);
  -- Liberar sólo nuestras retenciones dentro de la misma transacción. Un error
  -- posterior revierte este estado junto con todos los efectos anteriores.
  UPDATE public.point_intentos SET estado='VENTA_CONFIRMADA',venta_id=checkout_id,fecha_actualizacion=now()
    WHERE id=p_intento_id;
  FOR v_stock IN SELECT * FROM public.point_reservas_stock WHERE intento_id=p_intento_id ORDER BY producto_id LOOP
    UPDATE public.productos SET stock_actual=stock_actual-v_stock.cantidad,fecha_actualizacion=now()
      WHERE id=v_stock.producto_id;
    v_consumido:=0;
    FOR v_lote IN SELECT l.id,r.cantidad FROM public.point_reservas_lotes r
      JOIN public.lotes_producto l ON l.id=r.lote_id WHERE r.intento_id=p_intento_id
      AND l.producto_id=v_stock.producto_id ORDER BY l.fecha_vencimiento,l.fecha_ingreso,l.id LOOP
      UPDATE public.lotes_producto SET cantidad_actual=cantidad_actual-v_lote.cantidad,
        activo=(cantidad_actual-v_lote.cantidad)>0 WHERE id=v_lote.id;
      INSERT INTO public.movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas,usuario_id,lote_producto_id)
        VALUES(p_kiosco_id,v_stock.producto_id,'EGRESO',v_lote.cantidad,'VENTA',
          'Venta Point: '||v_intento.checkout_id::text,v_usuario,v_lote.id);
      v_consumido:=v_consumido+v_lote.cantidad;
    END LOOP;
    IF v_consumido<v_stock.cantidad THEN
      INSERT INTO public.movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas,usuario_id)
        VALUES(p_kiosco_id,v_stock.producto_id,'EGRESO',v_stock.cantidad-v_consumido,'VENTA',
          'Venta Point: '||v_intento.checkout_id::text,v_usuario);
    END IF;
  END LOOP;
  IF v_credito>0 THEN
    UPDATE public.clientes SET saldo_deudor=saldo_deudor+v_credito/100 WHERE id=v_cliente
      RETURNING saldo_deudor INTO v_saldo;
    INSERT INTO public.movimientos_cuenta_corriente(cliente_id,kiosco_id,venta_id,tipo,monto,saldo_resultante,usuario_id,notas)
      VALUES(v_cliente,p_kiosco_id,v_intento.checkout_id,'CARGO_VENTA',v_credito/100,v_saldo,v_usuario,'Venta Point');
  END IF;
  RETURN v_intento.checkout_id;
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_venta_point(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_venta_point(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
