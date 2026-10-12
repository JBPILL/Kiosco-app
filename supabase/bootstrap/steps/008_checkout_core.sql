-- Paso 26: cierre transaccional privado, preparado para el backend de cobro manual.
-- Requiere tablas de combos, lotes, cuenta corriente y costos privados de movimientos.
-- No conecta todavía PaymentModal/offlineSyncStore ni activa Point.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.producto_costos') IS NULL OR to_regclass('public.movimiento_stock_costos') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.movimientos_stock'::regclass
      AND tgname='trg_guardar_costo_privado_movimiento_stock' AND NOT tgisinternal AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'Aplicar primero costos privados de productos y movimientos';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.checkout_manuales (
  id uuid PRIMARY KEY,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  solicitud jsonb NOT NULL,
  resultado jsonb,
  venta_id uuid REFERENCES public.ventas(id),
  creado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checkout_manuales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_manuales FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.checkout_manuales TO service_role;
DROP POLICY IF EXISTS checkout_manual_servidor ON public.checkout_manuales;
CREATE POLICY checkout_manual_servidor ON public.checkout_manuales FOR SELECT TO service_role USING(true);

CREATE OR REPLACE FUNCTION public.checkout_objeto(p_datos jsonb,p_campos text[])
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Objeto de checkout inválido'; END IF;
  IF NOT p_datos ?& p_campos OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_datos) k WHERE NOT k=ANY(p_campos)) THEN
    RAISE EXCEPTION 'Campos de checkout inválidos';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.checkout_numero(p_valor jsonb,p_min numeric,p_max numeric,p_decimales integer)
RETURNS numeric LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE n numeric;
BEGIN
  IF jsonb_typeof(p_valor) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Número de checkout inválido'; END IF;
  n:=p_valor::text::numeric;
  IF n::text IN ('NaN','Infinity','-Infinity') OR n<p_min OR n>p_max OR n<>round(n,p_decimales) THEN
    RAISE EXCEPTION 'Número de checkout fuera de rango';
  END IF;
  RETURN n;
END;
$$;
CREATE OR REPLACE FUNCTION public.checkout_uuid(p_valor jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF jsonb_typeof(p_valor) IS DISTINCT FROM 'string'
    OR (p_valor#>>'{}') !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Identificador de checkout inválido';
  END IF;
  RETURN (p_valor#>>'{}')::uuid;
END;
$$;

-- Point es opcional: si sus tablas no están instaladas no hay reservas.
-- Nunca se liberan reservas de un intento ajeno desde un cobro manual.
CREATE OR REPLACE FUNCTION public.checkout_reserva_point(p_tipo text,p_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cantidad numeric:=0;
BEGIN
  IF to_regclass('public.point_intentos') IS NULL THEN RETURN 0; END IF;
  IF p_tipo='STOCK' AND to_regclass('public.point_reservas_stock') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(sum(r.cantidad),0) FROM public.point_reservas_stock r JOIN public.point_intentos i ON i.id=r.intento_id
      WHERE r.producto_id=$1 AND i.estado NOT IN (''CANCELADO'',''RECHAZADO'',''VENTA_CONFIRMADA'')' INTO cantidad USING p_id;
  ELSIF p_tipo='LOTE' AND to_regclass('public.point_reservas_lotes') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(sum(r.cantidad),0) FROM public.point_reservas_lotes r JOIN public.point_intentos i ON i.id=r.intento_id
      WHERE r.lote_id=$1 AND i.estado NOT IN (''CANCELADO'',''RECHAZADO'',''VENTA_CONFIRMADA'')' INTO cantidad USING p_id;
  ELSIF p_tipo='CREDITO' AND to_regclass('public.point_reservas_credito') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(sum(r.monto_centavos),0)/100 FROM public.point_reservas_credito r JOIN public.point_intentos i ON i.id=r.intento_id
      WHERE r.cliente_id=$1 AND i.estado NOT IN (''CANCELADO'',''RECHAZADO'',''VENTA_CONFIRMADA'')' INTO cantidad USING p_id;
  END IF;
  RETURN cantidad;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_venta_manual(p_actor_auth_id uuid,p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
#variable_conflict use_variable
DECLARE
  actor public.usuarios%ROWTYPE; original public.usuarios%ROWTYPE; comercio public.kioscos%ROWTYPE;
  caja public.sesiones_caja%ROWTYPE; operacion public.checkout_manuales%ROWTYPE; venta public.ventas%ROWTYPE;
  p public.productos%ROWTYPE; c public.clientes%ROWTYPE;
  kid uuid; uid uuid; caja_id uuid; venta_id uuid; cliente_id uuid;
  linea jsonb; pago jsonb; componente jsonb; fisicos jsonb:='[]'::jsonb; resultado jsonb; stocks jsonb:='[]'::jsonb;
  fecha timestamptz; total numeric; credito numeric:=0; suma numeric:=0; cantidad numeric; importe numeric;
  restante numeric; tomar numeric; retenido numeric; sin_lote numeric; stock_nuevo numeric; saldo numeric;
  receta jsonb; receta_actual jsonb; producto_id uuid; tipo_libre boolean;
  ids uuid[]:='{}'; productos_ids uuid[]:='{}'; pagos_ids uuid[]:='{}'; fila record; lote record;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN
    RAISE EXCEPTION 'Se requiere el servidor de cobro' USING ERRCODE='42501';
  END IF;
  IF p_actor_auth_id IS NULL OR p_solicitud IS NULL OR octet_length(p_solicitud::text)>200000 THEN
    RAISE EXCEPTION 'Solicitud de checkout inválida';
  END IF;
  PERFORM public.checkout_objeto(p_solicitud,ARRAY['version','id','kiosco_id','usuario_id','sesion_caja_id','fecha_hora','total','notas','cliente_id','detalles','pagos']);
  IF p_solicitud->'version' IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'Versión de checkout inválida'; END IF;
  venta_id:=public.checkout_uuid(p_solicitud->'id'); kid:=public.checkout_uuid(p_solicitud->'kiosco_id');
  uid:=public.checkout_uuid(p_solicitud->'usuario_id'); caja_id:=public.checkout_uuid(p_solicitud->'sesion_caja_id');
  IF jsonb_typeof(p_solicitud->'cliente_id')<>'null' THEN cliente_id:=public.checkout_uuid(p_solicitud->'cliente_id'); END IF;
  total:=public.checkout_numero(p_solicitud->'total',0,9999999999,0);
  IF jsonb_typeof(p_solicitud->'notas') NOT IN ('string','null') OR length(p_solicitud->>'notas')>10000
    OR jsonb_typeof(p_solicitud->'fecha_hora') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Texto de checkout inválido'; END IF;
  IF (p_solicitud->>'fecha_hora') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    RAISE EXCEPTION 'Fecha absoluta de checkout requerida';
  END IF;
  fecha:=(p_solicitud->>'fecha_hora')::timestamptz;
  IF NOT isfinite(fecha) OR fecha>now()+interval '5 minutes' THEN RAISE EXCEPTION 'Fecha de checkout inválida'; END IF;
  BEGIN
    SELECT * INTO STRICT actor FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN RAISE EXCEPTION 'Perfil de cobro no disponible' USING ERRCODE='42501'; END;
  IF actor.kiosco_id IS DISTINCT FROM kid OR NOT coalesce(actor.rol IN ('DUEÑO','CAJERO'),false)
    OR (actor.rol='CAJERO' AND actor.id IS DISTINCT FROM uid) THEN RAISE EXCEPTION 'Cobro no autorizado' USING ERRCODE='42501'; END IF;
  SELECT * INTO comercio FROM public.kioscos WHERE id=kid FOR SHARE;
  IF NOT FOUND OR comercio.estado_suscripcion IS DISTINCT FROM 'ACTIVO' THEN RAISE EXCEPTION 'Comercio sin cobros habilitados'; END IF;
  SELECT * INTO original FROM public.usuarios WHERE id=uid AND kiosco_id=kid AND activo AND rol IN ('DUEÑO','CAJERO') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario original no disponible'; END IF;

  -- La clave única espera un cierre concurrente y evita repetir cualquiera de sus efectos.
  INSERT INTO public.checkout_manuales(id,kiosco_id,solicitud) VALUES(venta_id,kid,p_solicitud) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO operacion FROM public.checkout_manuales WHERE id=venta_id FOR UPDATE;
  IF operacion.kiosco_id IS DISTINCT FROM kid OR operacion.solicitud IS DISTINCT FROM p_solicitud THEN
    RAISE EXCEPTION 'El identificador corresponde a otra solicitud';
  END IF;
  IF operacion.resultado IS NOT NULL THEN
    SELECT * INTO venta FROM public.ventas WHERE id=operacion.venta_id FOR SHARE;
    IF NOT FOUND OR venta.estado IS DISTINCT FROM 'COMPLETADA' THEN RAISE EXCEPTION 'La venta fue anulada o no está disponible'; END IF;
    IF venta.kiosco_id IS DISTINCT FROM kid OR venta.id IS DISTINCT FROM venta_id OR venta.total IS DISTINCT FROM total
      OR venta.usuario_id IS DISTINCT FROM uid OR venta.sesion_caja_id IS DISTINCT FROM caja_id OR venta.fecha_hora IS DISTINCT FROM fecha THEN
      RAISE EXCEPTION 'Resultado del checkout inconsistente';
    END IF;
    IF (SELECT count(*) FROM public.detalles_venta d WHERE d.venta_id=venta_id)<>jsonb_array_length(p_solicitud->'detalles')
      OR (SELECT sum(d.subtotal) FROM public.detalles_venta d WHERE d.venta_id=venta_id) IS DISTINCT FROM total
      OR (SELECT count(*) FROM public.pagos_venta pv WHERE pv.venta_id=venta_id)<>jsonb_array_length(p_solicitud->'pagos')
      OR (SELECT sum(pv.monto) FROM public.pagos_venta pv WHERE pv.venta_id=venta_id) IS DISTINCT FROM total THEN
      RAISE EXCEPTION 'Detalle o pagos del cierre requieren conciliación';
    END IF;
    RETURN operacion.resultado;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ventas WHERE id=venta_id) THEN RAISE EXCEPTION 'Existe una venta previa sin cierre transaccional; conciliar antes de reintentar'; END IF;
  SELECT * INTO caja FROM public.sesiones_caja WHERE id=caja_id AND kiosco_id=kid AND usuario_id=uid FOR UPDATE;
  IF NOT FOUND OR caja.estado IS DISTINCT FROM 'ABIERTA' OR caja.fecha_apertura IS NULL OR fecha<caja.fecha_apertura
    OR caja.fecha_cierre IS NOT NULL THEN RAISE EXCEPTION 'La caja original no está disponible; requiere conciliación'; END IF;
  IF jsonb_typeof(p_solicitud->'detalles') IS DISTINCT FROM 'array' OR jsonb_typeof(p_solicitud->'pagos') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Colecciones de checkout inválidas';
  END IF;
  IF jsonb_array_length(p_solicitud->'detalles') NOT BETWEEN 1 AND 500 OR jsonb_array_length(p_solicitud->'pagos') NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Cantidad de líneas de checkout inválida';
  END IF;
  FOR pago IN SELECT value FROM jsonb_array_elements(p_solicitud->'pagos') LOOP
    PERFORM public.checkout_objeto(pago,ARRAY['id','medio_pago','monto','referencia']);
    producto_id:=public.checkout_uuid(pago->'id');
    IF producto_id=ANY(pagos_ids) THEN RAISE EXCEPTION 'Pago repetido'; END IF;
    pagos_ids:=array_append(pagos_ids,producto_id);
    importe:=public.checkout_numero(pago->'monto',0,9999999999,0);
    IF (total>0 AND importe=0) OR pago->>'medio_pago' NOT IN ('EFECTIVO','TRANSFERENCIA','TARJETA','MERCADOPAGO','CUENTA_CORRIENTE')
      OR jsonb_typeof(pago->'medio_pago') IS DISTINCT FROM 'string'
      OR jsonb_typeof(pago->'referencia') NOT IN ('string','null') OR length(pago->>'referencia')>500 THEN RAISE EXCEPTION 'Pago inválido'; END IF;
    suma:=suma+importe;
    IF pago->>'medio_pago'='CUENTA_CORRIENTE' THEN credito:=credito+importe; END IF;
  END LOOP;
  IF suma<>total THEN RAISE EXCEPTION 'La suma de pagos no coincide con el total'; END IF;
  suma:=0;
  -- Bloquear todos los productos en orden estable antes de tocar componentes o lotes.
  PERFORM 1 FROM public.productos WHERE id IN (
    SELECT (value->>'producto_id')::uuid FROM jsonb_array_elements(p_solicitud->'detalles')
    UNION SELECT (comp->>'producto_id')::uuid FROM jsonb_array_elements(p_solicitud->'detalles') d,
      LATERAL jsonb_array_elements(d->'componentes') comp
  ) ORDER BY id FOR UPDATE;
  FOR linea IN SELECT value FROM jsonb_array_elements(p_solicitud->'detalles') LOOP
    PERFORM public.checkout_objeto(linea,ARRAY['id','producto_id','cantidad','precio_unitario','subtotal','sin_envase',
      'precio_envase_unitario','es_devolucion_envase','articulo_libre','componentes']);
    producto_id:=public.checkout_uuid(linea->'id');
    IF producto_id=ANY(ids) THEN RAISE EXCEPTION 'Detalle repetido'; END IF;
    ids:=array_append(ids,producto_id); producto_id:=public.checkout_uuid(linea->'producto_id');
    IF producto_id=ANY(productos_ids) THEN RAISE EXCEPTION 'Producto repetido'; END IF;
    productos_ids:=array_append(productos_ids,producto_id);
    cantidad:=public.checkout_numero(linea->'cantidad',0.001,999999,3);
    PERFORM public.checkout_numero(linea->'precio_unitario',0,9999999999.99,2);
    PERFORM public.checkout_numero(linea->'precio_envase_unitario',0,9999999999.99,2);
    importe:=public.checkout_numero(linea->'subtotal',-9999999999,9999999999,0); suma:=suma+importe;
    IF jsonb_typeof(linea->'sin_envase') IS DISTINCT FROM 'boolean' OR jsonb_typeof(linea->'es_devolucion_envase') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(linea->'componentes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Atributos del detalle inválidos'; END IF;
    IF importe<0 AND NOT (linea->>'es_devolucion_envase')::boolean THEN RAISE EXCEPTION 'Subtotal negativo no autorizado'; END IF;
    tipo_libre:=jsonb_typeof(linea->'articulo_libre')<>'null';
    IF tipo_libre THEN
      PERFORM public.checkout_objeto(linea->'articulo_libre',ARRAY['descripcion','precio_venta']);
      IF jsonb_typeof(linea#>'{articulo_libre,descripcion}') IS DISTINCT FROM 'string'
        OR length(trim(linea#>>'{articulo_libre,descripcion}')) NOT BETWEEN 1 AND 200
        OR cantidad<>trunc(cantidad) OR (linea->>'sin_envase')::boolean OR jsonb_array_length(linea->'componentes')<>0
        OR EXISTS (SELECT 1 FROM public.productos WHERE id=producto_id) THEN RAISE EXCEPTION 'Concepto virtual inválido'; END IF;
      PERFORM public.checkout_numero(linea#>'{articulo_libre,precio_venta}',-9999999999.99,9999999999.99,2);
      IF (linea#>>'{articulo_libre,precio_venta}')::numeric<0 AND NOT (linea->>'es_devolucion_envase')::boolean THEN RAISE EXCEPTION 'Concepto virtual negativo'; END IF;
      INSERT INTO public.productos(id,kiosco_id,descripcion,precio_venta,precio_costo,stock_actual,activo)
        VALUES(producto_id,kid,trim(linea#>>'{articulo_libre,descripcion}'),greatest(0,(linea#>>'{articulo_libre,precio_venta}')::numeric),0,0,false);
    ELSE
      IF (linea->>'es_devolucion_envase')::boolean THEN RAISE EXCEPTION 'Devolución requiere concepto virtual'; END IF;
      SELECT * INTO p FROM public.productos WHERE id=producto_id AND kiosco_id=kid AND activo;
      IF NOT FOUND OR (NOT coalesce(p.es_pesable,false) AND cantidad<>trunc(cantidad)) THEN RAISE EXCEPTION 'Producto o cantidad no disponible'; END IF;
      IF coalesce(p.es_combo,false) THEN
        IF jsonb_array_length(linea->'componentes') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Receta del combo inválida'; END IF;
        FOR componente IN SELECT value FROM jsonb_array_elements(linea->'componentes') LOOP
          PERFORM public.checkout_objeto(componente,ARRAY['producto_id','cantidad']);
          PERFORM public.checkout_uuid(componente->'producto_id');
          PERFORM public.checkout_numero(componente->'cantidad',0.001,999999,3);
        END LOOP;
        SELECT jsonb_agg(jsonb_build_object('producto_id',(value->>'producto_id')::uuid,'cantidad',(value->>'cantidad')::numeric)
          ORDER BY (value->>'producto_id')::uuid) INTO receta FROM jsonb_array_elements(linea->'componentes');
        SELECT jsonb_agg(jsonb_build_object('producto_id',componente_producto_id,'cantidad',ci.cantidad) ORDER BY componente_producto_id)
          INTO receta_actual FROM public.combo_items ci WHERE ci.combo_producto_id=producto_id AND ci.kiosco_id=kid;
        IF receta IS DISTINCT FROM receta_actual THEN RAISE EXCEPTION 'La receta cambió o está incompleta; requiere conciliación'; END IF;
        FOR componente IN SELECT value FROM jsonb_array_elements(receta) LOOP
          fisicos:=fisicos||jsonb_build_array(jsonb_build_object('producto_id',componente->'producto_id','cantidad',cantidad*(componente->>'cantidad')::numeric));
        END LOOP;
      ELSE
        IF jsonb_array_length(linea->'componentes')<>0 THEN RAISE EXCEPTION 'Receta inesperada'; END IF;
        fisicos:=fisicos||jsonb_build_array(jsonb_build_object('producto_id',producto_id,'cantidad',cantidad));
      END IF;
    END IF;
  END LOOP;
  IF suma<>total THEN RAISE EXCEPTION 'La suma de detalles no coincide con el total'; END IF;
  INSERT INTO public.ventas(id,kiosco_id,usuario_id,sesion_caja_id,fecha_hora,total,estado,notas,sincronizado)
    VALUES(venta_id,kid,uid,caja_id,fecha,total,'COMPLETADA',p_solicitud->>'notas',true);
  INSERT INTO public.detalles_venta(id,venta_id,producto_id,cantidad,precio_unitario,subtotal,sin_envase,precio_envase_unitario,es_devolucion_envase)
    SELECT (value->>'id')::uuid,venta_id,(value->>'producto_id')::uuid,(value->>'cantidad')::numeric,
      (value->>'precio_unitario')::numeric,(value->>'subtotal')::numeric,(value->>'sin_envase')::boolean,
      (value->>'precio_envase_unitario')::numeric,(value->>'es_devolucion_envase')::boolean FROM jsonb_array_elements(p_solicitud->'detalles');
  INSERT INTO public.pagos_venta(id,venta_id,medio_pago,monto,referencia)
    SELECT (value->>'id')::uuid,venta_id,value->>'medio_pago',(value->>'monto')::numeric,value->>'referencia' FROM jsonb_array_elements(p_solicitud->'pagos');

  FOR fila IN SELECT (value->>'producto_id')::uuid AS producto_id,sum((value->>'cantidad')::numeric) AS cantidad
    FROM jsonb_array_elements(fisicos) GROUP BY 1 ORDER BY 1 LOOP
    SELECT * INTO p FROM public.productos WHERE id=fila.producto_id AND kiosco_id=kid AND activo AND NOT coalesce(es_combo,false) FOR UPDATE;
    IF NOT FOUND OR p.stock_actual IS NULL OR p.stock_actual::text IN ('NaN','Infinity','-Infinity')
      OR p.stock_actual-public.checkout_reserva_point('STOCK',fila.producto_id)<fila.cantidad
      OR fila.cantidad<>round(fila.cantidad,3) OR (NOT coalesce(p.es_pesable,false) AND fila.cantidad<>trunc(fila.cantidad)) THEN
      RAISE EXCEPTION 'Stock disponible insuficiente o cantidad física inválida';
    END IF;
    restante:=fila.cantidad;
    -- No confundir mercadería sin lote con lotes retenidos o vencidos.
    IF EXISTS (SELECT 1 FROM public.lotes_producto l WHERE l.producto_id=fila.producto_id AND l.kiosco_id=kid
      AND (l.cantidad_actual IS NULL OR l.cantidad_actual<0 OR l.cantidad_actual::text IN ('NaN','Infinity','-Infinity')
        OR l.cantidad_actual<>round(l.cantidad_actual,3) OR l.fecha_vencimiento IS NULL)) THEN
      RAISE EXCEPTION 'Cantidad o fecha de lote inválida';
    END IF;
    SELECT p.stock_actual-coalesce(sum(l.cantidad_actual),0) INTO sin_lote FROM public.lotes_producto l
      WHERE l.producto_id=fila.producto_id AND l.kiosco_id=kid AND l.cantidad_actual>0;
    IF sin_lote<0 THEN RAISE EXCEPTION 'Stock físico y lotes inconsistentes'; END IF;
    FOR lote IN SELECT l.* FROM public.lotes_producto l WHERE l.producto_id=fila.producto_id AND l.kiosco_id=kid AND l.activo AND l.cantidad_actual>0
      ORDER BY l.fecha_vencimiento,l.fecha_ingreso,l.id FOR UPDATE LOOP
      EXIT WHEN restante<=0;
      IF lote.cantidad_actual::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Cantidad de lote inválida'; END IF;
      IF lote.fecha_vencimiento<(fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN CONTINUE; END IF;
      retenido:=public.checkout_reserva_point('LOTE',lote.id);
      tomar:=least(restante,greatest(0,lote.cantidad_actual-retenido));
      IF tomar>0 THEN
        UPDATE public.lotes_producto SET cantidad_actual=cantidad_actual-tomar,activo=(cantidad_actual-tomar)>0 WHERE id=lote.id;
        INSERT INTO public.movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas,usuario_id,fecha,lote_producto_id)
          VALUES(kid,fila.producto_id,'EGRESO',tomar,'VENTA','Checkout manual '||venta_id::text,uid,fecha,lote.id);
        restante:=restante-tomar;
      END IF;
    END LOOP;
    IF restante>0 AND (coalesce(p.requiere_vencimiento,false) OR restante>greatest(0,sin_lote)) THEN
      RAISE EXCEPTION 'Stock de lotes disponible insuficiente; requiere conciliación';
    END IF;
    IF restante>0 THEN
      INSERT INTO public.movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas,usuario_id,fecha)
        VALUES(kid,fila.producto_id,'EGRESO',restante,'VENTA','Checkout manual '||venta_id::text,uid,fecha);
    END IF;
    UPDATE public.productos SET stock_actual=stock_actual-fila.cantidad,fecha_actualizacion=now() WHERE id=fila.producto_id RETURNING stock_actual INTO stock_nuevo;
    stocks:=stocks||jsonb_build_array(jsonb_build_object('producto_id',fila.producto_id,'stock_actual',stock_nuevo));
  END LOOP;
  IF credito>0 THEN
    SELECT * INTO c FROM public.clientes WHERE id=cliente_id AND kiosco_id=kid AND activo FOR UPDATE;
    IF NOT FOUND OR c.saldo_deudor IS NULL OR c.limite_credito IS NULL OR c.limite_credito<0
      OR c.saldo_deudor::text IN ('NaN','Infinity','-Infinity') OR c.limite_credito::text IN ('NaN','Infinity','-Infinity')
      OR (c.limite_credito>0 AND c.saldo_deudor+credito+public.checkout_reserva_point('CREDITO',cliente_id)>c.limite_credito) THEN
      RAISE EXCEPTION 'Cliente o crédito disponible insuficiente; requiere conciliación';
    END IF;
    UPDATE public.clientes SET saldo_deudor=saldo_deudor+credito WHERE id=cliente_id RETURNING saldo_deudor INTO saldo;
    INSERT INTO public.movimientos_cuenta_corriente(cliente_id,kiosco_id,venta_id,tipo,monto,saldo_resultante,usuario_id,notas,fecha_hora)
      VALUES(cliente_id,kid,venta_id,'CARGO_VENTA',credito,saldo,uid,p_solicitud->>'notas',fecha);
  ELSIF cliente_id IS NOT NULL THEN
    PERFORM 1 FROM public.clientes WHERE id=cliente_id AND kiosco_id=kid AND activo FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no disponible'; END IF;
  END IF;
  resultado:=jsonb_build_object('venta_id',venta_id,'kiosco_id',kid,'total',total,'fecha_hora',fecha,'stock',stocks,'saldo_cliente',saldo);
  UPDATE public.checkout_manuales SET resultado=resultado,venta_id=venta_id WHERE id=venta_id;
  RETURN resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.checkout_objeto(jsonb,text[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.checkout_numero(jsonb,numeric,numeric,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.checkout_uuid(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.checkout_reserva_point(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.confirmar_venta_manual(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_venta_manual(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
