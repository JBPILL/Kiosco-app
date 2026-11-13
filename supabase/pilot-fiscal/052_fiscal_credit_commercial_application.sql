-- Aplicación comercial NC en una transacción, sólo tras CAE/resolución.
-- Requiere001–051 + módulos returns/001 y returns/003 y sus prerrequisitos.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.detalles_devolucion') IS NULL OR to_regclass('public.devolucion_reposiciones_atomicas') IS NULL OR to_regprocedure('public.confirmar_devolucion_efectivo_piloto(jsonb)') IS NULL THEN RAISE EXCEPTION 'Falta circuito de devolución atómica.'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.fiscal_nc_aplicaciones_homologacion(
 solicitud_id uuid PRIMARY KEY REFERENCES public.fiscal_nc_resoluciones_homologacion(solicitud_id),
 venta_id uuid NOT NULL REFERENCES public.ventas(id),operacion_origen_id uuid NOT NULL REFERENCES public.fiscal_operaciones_homologacion(id),
 kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),usuario_id uuid NOT NULL REFERENCES public.usuarios(id),actor_auth_id uuid NOT NULL,
 propuesta_sha256 text NOT NULL CHECK(propuesta_sha256 ~ '^[0-9a-f]{64}$'),solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
 sesion_caja_id uuid NOT NULL REFERENCES public.sesiones_caja(id),importe numeric(12,2) NOT NULL CHECK(importe>0),resultado jsonb NOT NULL,
 creada_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(solicitud_id) REFERENCES public.devoluciones_venta(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS public.fiscal_nc_reposiciones_homologacion(
 solicitud_id uuid NOT NULL REFERENCES public.fiscal_nc_aplicaciones_homologacion(solicitud_id) DEFERRABLE INITIALLY DEFERRED,
 movimiento_original_id uuid NOT NULL REFERENCES public.movimientos_stock(id),movimiento_nuevo_id uuid NOT NULL UNIQUE REFERENCES public.movimientos_stock(id),
 cantidad numeric(12,3) NOT NULL CHECK(cantidad>0),costo_unitario numeric(12,2) NOT NULL CHECK(costo_unitario>=0),
 PRIMARY KEY(solicitud_id,movimiento_original_id)
);
DO $$ DECLARE tabla text; columnas text; rol text; BEGIN
 FOREACH tabla IN ARRAY ARRAY['fiscal_nc_aplicaciones_homologacion','fiscal_nc_reposiciones_homologacion'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tabla);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tabla);
  SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid=('public.'||tabla)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas,tabla);
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Aplicación NC expuesta.'; END IF;
  END LOOP;
  EXECUTE format('DROP TRIGGER IF EXISTS fiscal_nc_aplicacion_inmutable ON public.%I',tabla);
  EXECUTE format('CREATE TRIGGER fiscal_nc_aplicacion_inmutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable()',tabla);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.fiscal_nc_devolucion_ajena(p_venta uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.devoluciones_venta d LEFT JOIN public.fiscal_nc_aplicaciones_homologacion a ON a.solicitud_id=d.id
 WHERE d.venta_id=p_venta AND (a.solicitud_id IS NULL OR a.venta_id IS DISTINCT FROM d.venta_id OR a.kiosco_id IS DISTINCT FROM d.kiosco_id OR a.usuario_id IS DISTINCT FROM d.usuario_id OR a.importe IS DISTINCT FROM d.monto_total OR d.metodo_reintegro IS DISTINCT FROM 'EFECTIVO_CAJA'))
$$;
REVOKE ALL ON FUNCTION public.fiscal_nc_devolucion_ajena(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Helper interno compartido: callers validan actor/venta/caja y conservan locks.
CREATE OR REPLACE FUNCTION public.aplicar_reposicion_historica_piloto(p_id uuid,p_venta uuid,p_kiosco uuid,p_usuario uuid,p_fisicos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r record;m record;pendiente numeric;disponible numeric;tomar numeric;anterior_stock numeric;nuevo_stock numeric;costo numeric;lote_antes numeric;lote_despues numeric;costo_confirmado numeric;movimiento_nuevo uuid;
 reposiciones jsonb:='[]';stocks jsonb:='[]';
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'La reposición histórica requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 IF p_id IS NULL OR p_venta IS NULL OR p_kiosco IS NULL OR p_usuario IS NULL OR jsonb_typeof(p_fisicos) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Reposición histórica inválida.'; END IF;
  FOR r IN SELECT (e->>'producto_id')::uuid producto_id,sum((e->>'cantidad')::numeric) cantidad FROM jsonb_array_elements(p_fisicos) e GROUP BY 1 ORDER BY 1 LOOP
    SELECT stock_actual INTO anterior_stock FROM public.productos WHERE id=r.producto_id AND kiosco_id=p_kiosco FOR UPDATE;
    IF NOT FOUND OR anterior_stock IS NULL OR anterior_stock::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Producto histórico no disponible'; END IF;
    IF r.cantidad<=0 OR r.cantidad<>trunc(r.cantidad,3) THEN RAISE EXCEPTION 'Cantidad física inválida.'; END IF;
    pendiente:=r.cantidad;
    FOR m IN SELECT * FROM public.movimientos_stock WHERE producto_id=r.producto_id AND kiosco_id=p_kiosco AND tipo='EGRESO'
      AND motivo='VENTA' AND notas='Checkout manual '||p_venta::text ORDER BY lote_producto_id NULLS LAST,id LOOP
      SELECT m.cantidad-(SELECT coalesce(sum(cantidad),0) FROM public.devolucion_reposiciones_atomicas WHERE movimiento_original_id=m.id)-(SELECT coalesce(sum(cantidad),0) FROM public.fiscal_nc_reposiciones_homologacion WHERE movimiento_original_id=m.id) INTO disponible;
      IF disponible<0 THEN RAISE EXCEPTION 'Reposición histórica inconsistente'; END IF;
      tomar:=least(pendiente,disponible);
      IF tomar<=0 THEN CONTINUE; END IF;
      SELECT precio_costo INTO costo FROM public.movimiento_stock_costos WHERE movimiento_id=m.id AND kiosco_id=p_kiosco;
      IF NOT FOUND OR costo IS NULL OR costo::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Costo histórico no disponible'; END IF;
      IF m.lote_producto_id IS NOT NULL THEN
        SELECT cantidad_actual INTO lote_antes FROM public.lotes_producto WHERE id=m.lote_producto_id AND producto_id=r.producto_id AND kiosco_id=p_kiosco FOR UPDATE;
        IF NOT FOUND OR lote_antes IS NULL OR lote_antes::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Lote histórico no disponible'; END IF;
        UPDATE public.lotes_producto SET cantidad_actual=cantidad_actual+tomar,activo=CASE WHEN cantidad_actual=0 THEN true ELSE activo END
          WHERE id=m.lote_producto_id RETURNING cantidad_actual INTO lote_despues;
        IF NOT FOUND OR lote_despues IS DISTINCT FROM lote_antes+tomar THEN RAISE EXCEPTION 'No se confirmó el lote devuelto'; END IF;
      END IF;
      INSERT INTO public.movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas,usuario_id,lote_producto_id)
        VALUES(p_kiosco,r.producto_id,'INGRESO',tomar,'DEVOLUCION','Devolución atómica '||p_id::text,p_usuario,m.lote_producto_id)
        RETURNING id INTO movimiento_nuevo;
      IF NOT FOUND THEN RAISE EXCEPTION 'No se confirmó el movimiento de stock devuelto'; END IF;
      UPDATE public.movimiento_stock_costos SET precio_costo=costo WHERE movimiento_id=movimiento_nuevo AND kiosco_id=p_kiosco RETURNING precio_costo INTO costo_confirmado;
      IF NOT FOUND OR costo_confirmado IS DISTINCT FROM costo THEN RAISE EXCEPTION 'No se confirmó el costo histórico devuelto'; END IF;
      reposiciones:=reposiciones||jsonb_build_array(jsonb_build_object('movimiento_id',m.id,'cantidad',tomar,'movimiento_nuevo_id',movimiento_nuevo,'costo_unitario',costo));
      pendiente:=pendiente-tomar;
      EXIT WHEN pendiente=0;
    END LOOP;
    IF pendiente<>0 THEN RAISE EXCEPTION 'No se puede reponer más stock que las salidas originales'; END IF;
    UPDATE public.productos SET stock_actual=stock_actual+r.cantidad,fecha_actualizacion=now() WHERE id=r.producto_id RETURNING stock_actual INTO nuevo_stock;
    IF nuevo_stock IS DISTINCT FROM anterior_stock+r.cantidad THEN RAISE EXCEPTION 'No se confirmó el stock devuelto'; END IF;
    stocks:=stocks||jsonb_build_array(jsonb_build_object('producto_id',r.producto_id,'stock_actual',nuevo_stock));
  END LOOP;
 RETURN jsonb_build_object('stock',stocks,'reposiciones',reposiciones);
END $$;
REVOKE ALL ON FUNCTION public.aplicar_reposicion_historica_piloto(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.confirmar_devolucion_efectivo_piloto(p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
<<devolucion_piloto>>
DECLARE actor public.usuarios%ROWTYPE; anterior public.devoluciones_parciales_atomicas%ROWTYPE;
  op_id uuid; venta_id uuid; kid uuid; caja uuid; plan jsonb; snapshot jsonb;
  detalle jsonb; original jsonb; seleccion jsonb; fisicos jsonb:='[]'::jsonb; elegidos jsonb:='[]'::jsonb;
  reposiciones jsonb:='[]'::jsonb; stocks jsonb:='[]'::jsonb; componente jsonb; r record; m record;
  total numeric; pendiente numeric; disponible numeric; tomar numeric; anterior_stock numeric; nuevo_stock numeric;
  costo numeric; resultado jsonb; rep jsonb; movimiento_nuevo uuid; filas integer;
  lote_antes numeric; lote_despues numeric; costo_confirmado numeric;
BEGIN
  IF jsonb_typeof(p_solicitud) IS DISTINCT FROM 'object' OR p_solicitud->>'metodo' IS DISTINCT FROM 'EFECTIVO_CAJA' THEN
    RAISE EXCEPTION 'El piloto admite reintegro en efectivo y nueva venta para cambios' USING ERRCODE='22023';
  END IF;
  op_id:=(p_solicitud->>'id')::uuid;
  IF op_id IS NULL THEN RAISE EXCEPTION 'Identificador de devolución requerido'; END IF;
  BEGIN SELECT * INTO STRICT actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Actor de devolución no autorizado' USING ERRCODE='42501'; END;
  IF actor.rol IS NULL OR actor.rol NOT IN ('DUEÑO','CAJERO') OR actor.kiosco_id IS NULL THEN RAISE EXCEPTION 'Rol de devolución no autorizado' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('devolucion:'||op_id::text,0));
  SELECT * INTO anterior FROM public.devoluciones_parciales_atomicas WHERE id=op_id;
  IF FOUND THEN
    IF anterior.actor_auth_id IS DISTINCT FROM auth.uid() OR anterior.kiosco_id IS DISTINCT FROM actor.kiosco_id OR anterior.solicitud IS DISTINCT FROM p_solicitud THEN
      RAISE EXCEPTION 'Conservá actor y solicitud original de devolución' USING ERRCODE='22023';
    END IF;
    RETURN anterior.resultado;
  END IF;
  PERFORM public.exigir_comercio_operativo(actor.kiosco_id);
  PERFORM public.exigir_capacidad_operativa_piloto(actor.kiosco_id,'DEVOLUCIONES_EFECTIVO');
  IF p_solicitud->'version'='2'::jsonb THEN
    plan:=public.preparar_devolucion_envases_piloto(p_solicitud);
  ELSE
    plan:=public.preparar_devolucion_parcial_privada(p_solicitud);
  END IF;
  IF (plan->>'confirmada')::boolean THEN RETURN plan->'resultado'; END IF;
  kid:=(plan->>'kiosco_id')::uuid; venta_id:=(plan->>'venta_id')::uuid;
  caja:=(p_solicitud->>'sesionReintegroId')::uuid; snapshot:=plan->'snapshot';
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'pagos') p WHERE p->>'medio_pago'<>'EFECTIVO') THEN
    RAISE EXCEPTION 'El primer circuito requiere una venta original pagada íntegramente en efectivo' USING ERRCODE='22023';
  END IF;
  -- Unit products cannot be returned as fractions. Historical fractional sales
  -- remain returnable; missing product metadata defaults to whole units.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_solicitud->'items') i
    JOIN public.detalles_venta d ON d.id=(i->>'detalleId')::uuid AND d.venta_id=devolucion_piloto.venta_id
    LEFT JOIN public.productos p ON p.id=d.producto_id AND p.kiosco_id=kid
    WHERE (i->>'cantidad')::numeric<>trunc((i->>'cantidad')::numeric)
      AND d.cantidad=trunc(d.cantidad) AND NOT coalesce(p.es_pesable,false)
      AND coalesce(p.unidad_medida,'UN')='UN') THEN
    RAISE EXCEPTION 'Los artículos por unidad requieren cantidades enteras' USING ERRCODE='22023';
  END IF;
  SELECT sum((e->>'importe')::numeric) INTO total FROM jsonb_array_elements(plan->'detalles') e;
  IF total IS NULL OR total<=0 THEN RAISE EXCEPTION 'El reintegro no tiene importe en efectivo'; END IF;
  PERFORM 1 FROM public.sesiones_caja WHERE id=caja AND kiosco_id=kid AND estado='ABIERTA' AND fecha_cierre IS NULL
    AND (usuario_id=actor.id OR actor.rol='DUEÑO') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seleccioná una caja abierta del comercio para el reintegro'; END IF;
  IF p_solicitud->'version'='2'::jsonb THEN
    plan:=plan||jsonb_build_object('envases',public.aplicar_envases_devolucion_piloto(plan,p_solicitud));
  END IF;
  -- Build physical quantities exclusively from the immutable checkout recipe.
  FOR original IN SELECT value FROM jsonb_array_elements(snapshot->'detalles') LOOP
    IF coalesce((original->>'es_devolucion_envase')::boolean,false) THEN
      IF p_solicitud->'version'='2'::jsonb THEN CONTINUE; END IF;
      RAISE EXCEPTION 'Venta con recepción de envases requiere conciliación antes de devolver';
    END IF;
    SELECT value INTO seleccion FROM jsonb_array_elements(p_solicitud->'items') WHERE value->>'detalleId'=original->>'id';
    IF seleccion IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.detalles_venta d WHERE d.id=(original->>'id')::uuid
      AND d.venta_id=devolucion_piloto.venta_id AND d.cantidad=(original->>'cantidad')::numeric
      AND d.producto_id IS NOT DISTINCT FROM nullif(original->>'producto_id','')::uuid) THEN
      RAISE EXCEPTION 'Detalle original inconsistente';
    END IF;
    IF jsonb_typeof(original->'articulo_libre')='object' THEN CONTINUE; END IF;
    IF jsonb_array_length(original->'componentes')>0 AND seleccion IS NOT NULL AND (seleccion->>'cantidad')::numeric<>trunc((seleccion->>'cantidad')::numeric) THEN
      RAISE EXCEPTION 'Los combos se devuelven en unidades completas';
    END IF;
    FOR componente IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_array_length(original->'componentes')>0 THEN original->'componentes'
      ELSE jsonb_build_array(jsonb_build_object('producto_id',original->>'producto_id','cantidad',1)) END) LOOP
      fisicos:=fisicos||jsonb_build_array(jsonb_build_object('producto_id',componente->>'producto_id','cantidad',(original->>'cantidad')::numeric*(componente->>'cantidad')::numeric));
      IF seleccion IS NOT NULL AND (seleccion->>'reingresaStock')::boolean THEN
        elegidos:=elegidos||jsonb_build_array(jsonb_build_object('producto_id',componente->>'producto_id','cantidad',(seleccion->>'cantidad')::numeric*(componente->>'cantidad')::numeric));
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS(WITH esperados AS(SELECT (e->>'producto_id')::uuid producto_id,sum((e->>'cantidad')::numeric) cantidad FROM jsonb_array_elements(fisicos) e GROUP BY 1),
    reales AS(SELECT producto_id,sum(cantidad) cantidad FROM public.movimientos_stock WHERE kiosco_id=kid AND tipo='EGRESO' AND motivo='VENTA' AND notas='Checkout manual '||venta_id::text GROUP BY 1)
    SELECT 1 FROM esperados FULL JOIN reales USING(producto_id) WHERE esperados.cantidad IS DISTINCT FROM reales.cantidad) THEN
    RAISE EXCEPTION 'Salidas históricas de stock inconsistentes';
  END IF;
  rep:=public.aplicar_reposicion_historica_piloto(op_id,venta_id,kid,actor.id,elegidos);
  stocks:=rep->'stock';reposiciones:=rep->'reposiciones';
  INSERT INTO public.devoluciones_venta(id,venta_id,kiosco_id,usuario_id,metodo_reintegro,motivo,monto_total,notas)
    VALUES(op_id,venta_id,kid,actor.id,'EFECTIVO_CAJA',p_solicitud->>'motivo',total,p_solicitud->>'notas');
  GET DIAGNOSTICS filas=ROW_COUNT;
  IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó la cabecera de devolución'; END IF;
  FOR detalle IN SELECT value FROM jsonb_array_elements(plan->'detalles') LOOP
    SELECT value INTO original FROM jsonb_array_elements(snapshot->'detalles') WHERE value->>'id'=detalle->>'detalle_id';
    SELECT value INTO seleccion FROM jsonb_array_elements(p_solicitud->'items') WHERE value->>'detalleId'=detalle->>'detalle_id';
    INSERT INTO public.detalles_devolucion(devolucion_id,detalle_venta_id,producto_id,cantidad,precio_unitario,subtotal,reingresa_stock)
      VALUES(op_id,(detalle->>'detalle_id')::uuid,nullif(original->>'producto_id','')::uuid,(detalle->>'cantidad')::numeric,
        (original->>'precio_unitario')::numeric,(detalle->>'importe')::numeric,(seleccion->>'reingresaStock')::boolean);
    GET DIAGNOSTICS filas=ROW_COUNT;
    IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el detalle devuelto'; END IF;
  END LOOP;
  INSERT INTO public.movimientos_caja(id,kiosco_id,sesion_caja_id,usuario_id,tipo,motivo,monto,descripcion)
    VALUES(op_id,kid,caja,actor.id,'EGRESO','DEVOLUCION_VENTA',total,'Devolución atómica '||venta_id::text);
  GET DIAGNOSTICS filas=ROW_COUNT;
  IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el reintegro en caja'; END IF;
  resultado:=jsonb_build_object('id',op_id,'venta_id',venta_id,'kiosco_id',kid,'monto_total',total,'sesion_caja_id',caja,'detalles',plan->'detalles','stock',stocks);
  IF p_solicitud->'version'='2'::jsonb THEN resultado:=resultado||jsonb_build_object('envases',plan->'envases'); END IF;
  INSERT INTO public.devoluciones_parciales_atomicas(id,venta_id,kiosco_id,actor_auth_id,solicitud,resultado)
    VALUES(op_id,venta_id,kid,auth.uid(),p_solicitud,resultado);
  GET DIAGNOSTICS filas=ROW_COUNT;
  IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó la operación de devolución'; END IF;
  FOR rep IN SELECT value FROM jsonb_array_elements(reposiciones) LOOP
    INSERT INTO public.devolucion_reposiciones_atomicas(devolucion_id,movimiento_original_id,cantidad) VALUES(op_id,(rep->>'movimiento_id')::uuid,(rep->>'cantidad')::numeric);
    GET DIAGNOSTICS filas=ROW_COUNT;
    IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó la reposición histórica'; END IF;
  END LOOP;
  RETURN resultado;
END $$;
CREATE OR REPLACE FUNCTION public.fiscal_proteger_devolucion_reservada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ids uuid[];
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'La exclusión fiscal requiere READ COMMITTED; reintentar en una transacción nueva.' USING ERRCODE='25001';
 END IF;
 ids:=CASE TG_OP WHEN 'INSERT' THEN ARRAY[NEW.venta_id] WHEN 'DELETE' THEN ARRAY[OLD.venta_id]
  ELSE ARRAY[OLD.venta_id,NEW.venta_id] END;
 -- El mismo lock de venta que toma fiscal_operacion_vigente_homologacion.
 -- Comprobar después de esperar: no usar una lectura previa al bloqueo.
 PERFORM 1 FROM public.ventas WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.fiscal_reservas_homologacion r
  JOIN public.fiscal_operaciones_homologacion o ON o.id=r.operacion_id WHERE o.venta_id=ANY(ids)) THEN
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.fiscal_nc_aplicaciones_homologacion a WHERE a.solicitud_id=NEW.id AND a.venta_id=NEW.venta_id AND a.kiosco_id=NEW.kiosco_id AND a.usuario_id=NEW.usuario_id AND a.importe=NEW.monto_total AND NEW.metodo_reintegro='EFECTIVO_CAJA') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'La venta tiene facturación reservada o confirmada; requiere circuito fiscal antes de devolver.' USING ERRCODE='55000';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.cargar_fuente_comercial_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE fuente jsonb; fiscal public.fiscal_operaciones_homologacion%ROWTYPE;
 venta public.ventas%ROWTYPE; cierre public.checkout_manuales%ROWTYPE; entrada public.checkout_manual_entradas%ROWTYPE;
 snapshot jsonb; detalle jsonb; pago jsonb; componente jsonb; actuales jsonb; linea jsonb;
 lineas jsonb:='[]'::jsonb; pagos jsonb:='[]'::jsonb; fisicos jsonb:='[]'::jsonb; componentes jsonb;
 ids uuid[]:='{}'; ids_pago uuid[]:='{}'; ids_componente uuid[]; detalle_id uuid; producto_uuid uuid; pago_id uuid;
 cantidad numeric; importe numeric; suma numeric:=0; suma_pagos numeric:=0; efectivo boolean:=true; tipo text;
BEGIN
 -- 026 acredita rol privado/RC, Dueño ordinario activo, Auth original y factura íntegra.
 fuente:=public.cargar_representacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 SELECT * INTO STRICT fiscal FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_origen_id;
 SELECT * INTO STRICT venta FROM public.ventas WHERE id=p_venta_id;
 -- El circuito checkout/devolución toma checkout antes de venta. No esperar aquí
 -- con venta ya bloqueada por 026: conflicto => reconsultar en transacción nueva.
 SELECT * INTO cierre FROM public.checkout_manuales WHERE venta_id=p_venta_id AND kiosco_id=fiscal.kiosco_id FOR SHARE NOWAIT;
 IF NOT FOUND OR cierre.resultado IS NULL THEN RAISE EXCEPTION 'Falta cierre comercial confirmado.' USING ERRCODE='55000'; END IF;
 SELECT * INTO entrada FROM public.checkout_manual_entradas WHERE id=cierre.id AND kiosco_id=fiscal.kiosco_id FOR SHARE NOWAIT;
 IF NOT FOUND OR entrada.snapshot IS DISTINCT FROM cierre.solicitud THEN RAISE EXCEPTION 'Snapshot comercial no confirmado.' USING ERRCODE='55000'; END IF;
 snapshot:=cierre.solicitud;
 IF venta.estado IS DISTINCT FROM 'COMPLETADA' OR venta.kiosco_id IS DISTINCT FROM fiscal.kiosco_id
  OR cierre.id IS DISTINCT FROM venta.id OR snapshot->'version' IS DISTINCT FROM '1'::jsonb
  OR public.checkout_uuid(snapshot->'id') IS DISTINCT FROM venta.id OR public.checkout_uuid(snapshot->'kiosco_id') IS DISTINCT FROM venta.kiosco_id
  OR public.checkout_uuid(snapshot->'usuario_id') IS DISTINCT FROM venta.usuario_id OR entrada.usuario_id IS DISTINCT FROM venta.usuario_id
  OR public.checkout_uuid(snapshot->'sesion_caja_id') IS DISTINCT FROM venta.sesion_caja_id
  OR (snapshot->>'fecha_hora')::timestamptz IS DISTINCT FROM venta.fecha_hora
  OR public.checkout_uuid(cierre.resultado->'venta_id') IS DISTINCT FROM venta.id OR public.checkout_uuid(cierre.resultado->'kiosco_id') IS DISTINCT FROM venta.kiosco_id
  OR public.checkout_numero(snapshot->'total',0.01,9999999999.99,2) IS DISTINCT FROM venta.total
  OR public.checkout_numero(cierre.resultado->'total',0.01,9999999999.99,2) IS DISTINCT FROM venta.total
  OR venta.total IS DISTINCT FROM (fuente#>>'{constancia,solicitud,solicitud,importes,total}')::numeric
  OR fiscal.venta_snapshot->'detalles' IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.detalles_venta d WHERE d.venta_id=venta.id)
  OR public.fiscal_nc_devolucion_ajena(venta.id)
  OR jsonb_typeof(snapshot->'detalles') IS DISTINCT FROM 'array' OR jsonb_array_length(snapshot->'detalles') NOT BETWEEN 1 AND 200
  OR jsonb_typeof(snapshot->'pagos') IS DISTINCT FROM 'array' OR jsonb_array_length(snapshot->'pagos') NOT BETWEEN 1 AND 20 THEN
  RAISE EXCEPTION 'Historia comercial distinta de la factura.' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.sesiones_caja WHERE id=venta.sesion_caja_id AND kiosco_id=venta.kiosco_id AND usuario_id=venta.usuario_id FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Caja original no acreditada.' USING ERRCODE='22023'; END IF;
 FOR pago IN SELECT value FROM jsonb_array_elements(snapshot->'pagos') LOOP
  PERFORM public.checkout_objeto(pago,ARRAY['id','medio_pago','monto','referencia']);
  pago_id:=public.checkout_uuid(pago->'id');
  importe:=public.checkout_numero(pago->'monto',0.01,9999999999.99,2);
  IF pago_id=ANY(ids_pago) OR jsonb_typeof(pago->'medio_pago') IS DISTINCT FROM 'string'
   OR pago->>'medio_pago' NOT IN ('EFECTIVO','TARJETA','TRANSFERENCIA','MERCADOPAGO','CUENTA_CORRIENTE') THEN
   RAISE EXCEPTION 'Pago histórico inválido.' USING ERRCODE='22023'; END IF;
  ids_pago:=array_append(ids_pago,pago_id); suma_pagos:=suma_pagos+importe;
  efectivo:=efectivo AND pago->>'medio_pago'='EFECTIVO';
  IF NOT EXISTS(SELECT 1 FROM public.pagos_venta p WHERE p.id=pago_id AND p.venta_id=venta.id AND p.medio_pago=pago->>'medio_pago'
   AND p.monto=importe AND p.referencia IS NOT DISTINCT FROM pago->>'referencia') THEN
   RAISE EXCEPTION 'Pago modificado después del cierre.' USING ERRCODE='22023'; END IF;
  pagos:=pagos||jsonb_build_array(jsonb_build_object('medio',pago->>'medio_pago','importe',importe::numeric(12,2)::text));
 END LOOP;
 IF suma_pagos IS DISTINCT FROM venta.total OR cardinality(ids_pago)<>(SELECT count(*) FROM public.pagos_venta WHERE venta_id=venta.id) THEN
  RAISE EXCEPTION 'Pagos no coinciden con el cierre.' USING ERRCODE='22023'; END IF;
 FOR detalle IN SELECT value FROM jsonb_array_elements(snapshot->'detalles') ORDER BY (value->>'id')::uuid LOOP
  PERFORM public.checkout_objeto(detalle,ARRAY['id','producto_id','cantidad','precio_unitario','subtotal','sin_envase','precio_envase_unitario','es_devolucion_envase','articulo_libre','componentes']);
  detalle_id:=public.checkout_uuid(detalle->'id'); producto_uuid:=public.checkout_uuid(detalle->'producto_id');
  cantidad:=public.checkout_numero(detalle->'cantidad',0.001,999999999.999,3);
  importe:=public.checkout_numero(detalle->'subtotal',0,9999999999.99,2);
  PERFORM public.checkout_numero(detalle->'precio_unitario',0,9999999999.99,2);
  PERFORM public.checkout_numero(detalle->'precio_envase_unitario',0,9999999999.99,2);
  IF detalle_id=ANY(ids) OR jsonb_typeof(detalle->'sin_envase') IS DISTINCT FROM 'boolean'
   OR detalle->'es_devolucion_envase' IS DISTINCT FROM 'false'::jsonb OR jsonb_typeof(detalle->'componentes') IS DISTINCT FROM 'array'
   OR jsonb_array_length(detalle->'componentes')>500 THEN RAISE EXCEPTION 'Detalle histórico inválido.' USING ERRCODE='22023'; END IF;
  ids:=array_append(ids,detalle_id); suma:=suma+importe;
  SELECT to_jsonb(d) INTO actuales FROM public.detalles_venta d WHERE d.id=detalle_id AND d.venta_id=venta.id;
  IF actuales IS NULL OR (actuales->>'producto_id')::uuid IS DISTINCT FROM producto_uuid
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['cantidad','precio_unitario','subtotal','sin_envase','precio_envase_unitario','es_devolucion_envase']) campo
   WHERE actuales->campo IS DISTINCT FROM detalle->campo) THEN RAISE EXCEPTION 'Detalle modificado después del cierre.' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id=producto_uuid AND kiosco_id=venta.kiosco_id) THEN RAISE EXCEPTION 'Producto histórico de otro comercio.' USING ERRCODE='22023'; END IF;
  componentes:='[]'::jsonb; ids_componente:='{}';
  IF jsonb_typeof(detalle->'articulo_libre')='object' THEN
   tipo:='LIBRE';
   IF cantidad<>trunc(cantidad) OR jsonb_array_length(detalle->'componentes')<>0 THEN RAISE EXCEPTION 'Concepto libre histórico inválido.' USING ERRCODE='22023'; END IF;
  ELSIF detalle->'articulo_libre'='null'::jsonb THEN
   tipo:=CASE WHEN jsonb_array_length(detalle->'componentes')>0 THEN 'COMBO' ELSE 'PRODUCTO' END;
   -- Una fuente de hechos conserva combos pesables admitidos por checkout.
   -- No determina aquí qué cantidades podrá devolver el circuito NC.
   FOR componente IN SELECT value FROM jsonb_array_elements(CASE WHEN tipo='COMBO' THEN detalle->'componentes' ELSE jsonb_build_array(jsonb_build_object('producto_id',producto_uuid,'cantidad',1)) END) ORDER BY (value->>'producto_id')::uuid LOOP
    PERFORM public.checkout_objeto(componente,ARRAY['producto_id','cantidad']);
    pago_id:=public.checkout_uuid(componente->'producto_id');
    IF pago_id=ANY(ids_componente) OR NOT EXISTS(SELECT 1 FROM public.productos WHERE id=pago_id AND kiosco_id=venta.kiosco_id) THEN RAISE EXCEPTION 'Componente histórico inválido.' USING ERRCODE='22023'; END IF;
    ids_componente:=array_append(ids_componente,pago_id);
    PERFORM public.checkout_numero(componente->'cantidad',0.001,999999,3);
    componentes:=componentes||jsonb_build_array(jsonb_build_object('producto_id',pago_id,'cantidad',((componente->>'cantidad')::numeric)::numeric(12,3)::text));
    fisicos:=fisicos||jsonb_build_array(jsonb_build_object('producto_id',pago_id,'cantidad',cantidad*(componente->>'cantidad')::numeric));
   END LOOP;
  ELSE RAISE EXCEPTION 'Tipo histórico no acreditado.' USING ERRCODE='22023'; END IF;
  linea:=jsonb_build_object('detalle_id',detalle_id,'producto_id',producto_uuid,'cantidad',cantidad::numeric(12,3)::text,'subtotal',importe::numeric(12,2)::text,
   'tipo',tipo,'componentes',componentes,'sin_envase',detalle->'sin_envase','precio_envase_unitario',((detalle->>'precio_envase_unitario')::numeric)::numeric(12,2)::text);
  lineas:=lineas||jsonb_build_array(linea);
 END LOOP;
 IF suma IS DISTINCT FROM venta.total OR cardinality(ids)<>(SELECT count(*) FROM public.detalles_venta WHERE venta_id=venta.id) THEN RAISE EXCEPTION 'Importes comerciales distintos.' USING ERRCODE='22023'; END IF;
 IF EXISTS(WITH esperados AS(SELECT (x->>'producto_id')::uuid producto_id,sum((x->>'cantidad')::numeric) cantidad FROM jsonb_array_elements(fisicos) x GROUP BY 1),
  reales AS(SELECT m.producto_id,sum(m.cantidad) cantidad FROM public.movimientos_stock m WHERE m.kiosco_id=venta.kiosco_id AND m.tipo='EGRESO' AND m.motivo='VENTA' AND m.notas='Checkout manual '||venta.id::text GROUP BY 1)
  SELECT 1 FROM esperados FULL JOIN reales USING(producto_id) WHERE esperados.cantidad IS DISTINCT FROM reales.cantidad) THEN
  RAISE EXCEPTION 'Receta y salidas físicas distintas.' USING ERRCODE='22023'; END IF;
 -- Checksum privado de la representación PostgreSQL del snapshot; NO es un
 -- cuerpo fiscal canónico ni una propuesta que deba recomputar el navegador.
 RETURN jsonb_build_object('version',1,'venta_id',venta.id,'operacion_origen_id',fiscal.id,'solicitud_sha256',fuente#>>'{constancia,solicitud,sha256}',
  'checkout_sha256',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),
  'total',venta.total::numeric(12,2)::text,'pago_integro_efectivo',efectivo,'unidades_historicas','NO_REGISTRADAS',
  'lineas',lineas,'pagos',pagos,'emision_habilitada',false,'reintegro_habilitado',false,'reposicion_habilitada',false);
END $$;
CREATE OR REPLACE FUNCTION public.guardar_borrador_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_canonico text,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE fuente jsonb; datos jsonb; cuerpo jsonb; x jsonb; original jsonb; previo jsonb; campo text; clave text; caso_id uuid;
 anterior public.fiscal_nc_borradores_homologacion%ROWTYPE; emisor public.fiscal_emisores_homologacion%ROWTYPE; parametros public.fiscal_parametros_homologacion%ROWTYPE;
 venta public.ventas%ROWTYPE; op public.fiscal_operaciones_homologacion%ROWTYPE; cantidad numeric; importe numeric; base numeric; previo_importe numeric; secuencia integer;
BEGIN
 fuente:=public.cargar_representacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 IF p_canonico IS NULL OR octet_length(p_canonico)>60000 OR p_sha IS NULL OR p_sha !~ '^[0-9a-f]{64}$'
  OR p_sha IS DISTINCT FROM encode(sha256(convert_to(p_canonico,'UTF8')),'hex') THEN RAISE EXCEPTION 'Canónico NC inválido.' USING ERRCODE='22023'; END IF;
 datos:=p_canonico::jsonb;
 IF p_canonico IS DISTINCT FROM public.fiscal_json_canonico_homologacion(datos) OR jsonb_typeof(datos->'solicitud_id') IS DISTINCT FROM 'string'
  OR (datos->>'solicitud_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Canónico NC inválido.' USING ERRCODE='22023'; END IF;
 caso_id:=(datos->>'solicitud_id')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:nc:'||caso_id::text,0));
 SELECT * INTO anterior FROM public.fiscal_nc_borradores_homologacion b WHERE b.id=caso_id FOR SHARE;
 IF FOUND THEN
  IF anterior.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR anterior.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id
   OR anterior.propuesta_sha256 IS DISTINCT FROM p_sha OR anterior.canonico IS DISTINCT FROM p_canonico THEN RAISE EXCEPTION 'Conservar identidad NC original.' USING ERRCODE='22023'; END IF;
  RETURN public.fiscal_nc_ack(caso_id);
 END IF;
 PERFORM public.fiscal_validar_borrador_nc(datos,fuente);
 SELECT * INTO venta FROM public.ventas WHERE public.ventas.id=p_venta_id;
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE public.fiscal_operaciones_homologacion.id=p_operacion_origen_id;
 cuerpo:=fuente#>'{constancia,solicitud,solicitud}';
 IF venta.estado IS DISTINCT FROM 'COMPLETADA' OR venta.total IS DISTINCT FROM (cuerpo#>>'{importes,total}')::numeric
  OR op.venta_snapshot->'detalles' IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.detalles_venta d WHERE d.venta_id=p_venta_id)
  OR public.fiscal_nc_devolucion_ajena(p_venta_id) THEN RAISE EXCEPTION 'Historia comercial NC incompatible.' USING ERRCODE='22023'; END IF;
 SELECT * INTO emisor FROM public.fiscal_emisores_homologacion WHERE kiosco_id=op.kiosco_id AND habilitado FOR SHARE;
 IF NOT FOUND OR emisor.cuit_emisor IS DISTINCT FROM cuerpo->>'cuitEmisor' OR emisor.punto_venta>99998 THEN RAISE EXCEPTION 'Emisor NC no disponible.' USING ERRCODE='42501'; END IF;
 SELECT * INTO parametros FROM public.fiscal_parametros_homologacion WHERE habilitado AND consultado_en<=clock_timestamp() AND vence_en>clock_timestamp() ORDER BY revision DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND OR parametros.consultado_en>clock_timestamp() OR parametros.vence_en<=clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(parametros.condiciones) c WHERE c->'id'=datos->'condicion_iva_receptor')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(datos->'iva') i WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(parametros.alicuotas) a WHERE a->'id'=i->'id')) THEN RAISE EXCEPTION 'Parámetros NC no disponibles.' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(b.datos),'[]'::jsonb) INTO previo FROM public.fiscal_nc_borradores_homologacion b
  WHERE b.operacion_origen_id=p_operacion_origen_id AND NOT EXISTS(SELECT 1 FROM public.fiscal_nc_cancelaciones_homologacion c WHERE c.solicitud_id=b.id);
 FOREACH campo IN ARRAY ARRAY['total','neto','iva','noGravado','exento','tributos'] LOOP
  SELECT coalesce(sum((p->'importes'->>campo)::numeric),0) INTO importe FROM jsonb_array_elements(previo) p;
  IF importe+(datos->'importes'->>campo)::numeric>(cuerpo->'importes'->>campo)::numeric THEN RAISE EXCEPTION 'Saldo fiscal NC insuficiente.' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(datos->'lineas') LOOP
  SELECT value INTO original FROM jsonb_array_elements(fuente#>'{contexto,lineas}') WHERE value->>'detalle_id'=x->>'detalle_id';
  SELECT coalesce(sum((l->>'cantidad')::numeric),0),coalesce(sum((l->>'importe')::numeric),0) INTO cantidad,importe
   FROM jsonb_array_elements(previo) p CROSS JOIN LATERAL jsonb_array_elements(p->'lineas') l WHERE l->>'detalle_id'=x->>'detalle_id';
  IF cantidad+(x->>'cantidad')::numeric>(original->>'cantidad')::numeric OR importe+(x->>'importe')::numeric>(original->>'subtotal')::numeric
   OR (x->>'importe')::numeric IS DISTINCT FROM round((original->>'subtotal')::numeric*(cantidad+(x->>'cantidad')::numeric)/(original->>'cantidad')::numeric,2)-round((original->>'subtotal')::numeric*cantidad/(original->>'cantidad')::numeric,2) THEN RAISE EXCEPTION 'Saldo o reparto comercial NC distinto.' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(datos->'iva') LOOP
  SELECT value INTO original FROM jsonb_array_elements(cuerpo->'iva') WHERE value->'id'=x->'id';
  SELECT coalesce(sum((l->>'base')::numeric),0),coalesce(sum((l->>'importe')::numeric),0) INTO base,importe FROM jsonb_array_elements(previo) p CROSS JOIN LATERAL jsonb_array_elements(p->'iva') l WHERE l->'id'=x->'id';
  IF base+(x->>'base')::numeric>(original->>'base')::numeric OR importe+(x->>'importe')::numeric>(original->>'importe')::numeric THEN RAISE EXCEPTION 'Saldo IVA NC insuficiente.' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(datos->'tributos') LOOP
  clave:=public.fiscal_nc_tributo_clave(x);
  SELECT sum((l->>'base')::numeric),sum((l->>'importe')::numeric) INTO cantidad,importe FROM jsonb_array_elements(cuerpo->'tributos') l WHERE public.fiscal_nc_tributo_clave(l)=clave;
  SELECT coalesce(sum((l->>'base')::numeric),0),coalesce(sum((l->>'importe')::numeric),0) INTO base,previo_importe FROM jsonb_array_elements(previo) p CROSS JOIN LATERAL jsonb_array_elements(p->'tributos') l WHERE public.fiscal_nc_tributo_clave(l)=clave;
  IF base+(x->>'base')::numeric>cantidad OR previo_importe+(x->>'importe')::numeric>importe THEN RAISE EXCEPTION 'Saldo tributo NC insuficiente.' USING ERRCODE='22023'; END IF;
 END LOOP;
 SELECT coalesce(max(b.secuencia),0)+1 INTO secuencia FROM public.fiscal_nc_borradores_homologacion b WHERE b.operacion_origen_id=p_operacion_origen_id;
 INSERT INTO public.fiscal_nc_borradores_homologacion(id,operacion_origen_id,actor_auth_id,secuencia,canonico,datos,propuesta_sha256,credencial_id,certificado_sha256,emisor_revision,punto_venta,parametros_revision)
  VALUES(caso_id,p_operacion_origen_id,p_actor_auth_id,secuencia,p_canonico,datos,p_sha,emisor.credencial_id,emisor.certificado_sha256,emisor.revision,emisor.punto_venta,parametros.revision);
 RETURN public.fiscal_nc_ack(caso_id);
END $$;
CREATE OR REPLACE FUNCTION public.cargar_aplicacion_comercial_nc_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE intento jsonb;a public.fiscal_nc_aplicaciones_homologacion%ROWTYPE;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Trabajador privado con aislamiento compatible requerido.' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.fiscal_nc_aplicaciones_homologacion WHERE solicitud_id=p_caso FOR SHARE;
 IF NOT FOUND THEN
  intento:=public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
  IF intento IS NULL THEN RAISE EXCEPTION 'Requiere intención NC.' USING ERRCODE='55000'; END IF;
  RETURN NULL;
 END IF;
 -- Recover immutable historical evidence without granting new commercial permission.
 IF a.actor_auth_id IS DISTINCT FROM p_actor OR a.venta_id IS DISTINCT FROM p_venta OR a.operacion_origen_id IS DISTINCT FROM p_operacion OR a.propuesta_sha256 IS DISTINCT FROM p_sha
  OR (SELECT count(*) FROM public.usuarios WHERE auth_user_id=p_actor AND activo)<>1
  OR NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=a.usuario_id AND u.auth_user_id=p_actor AND u.activo AND u.rol='DUEÑO' AND NOT u.es_superadmin AND u.kiosco_id=a.kiosco_id FOR SHARE)
 THEN RAISE EXCEPTION 'Aplicación NC ajena.' USING ERRCODE='42501'; END IF;
 RETURN a.resultado;
END $$;
CREATE OR REPLACE FUNCTION public.aplicar_comercial_nc_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text,p_caja uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE anterior jsonb;plan jsonb;reposicion jsonb;resultado jsonb;d jsonb;r jsonb;precio numeric;kid uuid;usuario uuid;importe numeric;filas integer;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Aplicación NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 anterior:=public.cargar_aplicacion_comercial_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF anterior IS NOT NULL THEN
  IF anterior->>'sesion_caja_id' IS DISTINCT FROM p_caja::text THEN RAISE EXCEPTION 'Conservar caja original de aplicación NC.' USING ERRCODE='22023'; END IF;
  RETURN anterior;
 END IF;
 -- 026 mantiene lock de venta;051 retiene serie/caja/productos en esta transacción.
 plan:=public.preparar_aplicacion_comercial_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha,p_caja);
 anterior:=public.cargar_aplicacion_comercial_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF anterior IS NOT NULL THEN
  IF anterior->>'sesion_caja_id' IS DISTINCT FROM p_caja::text THEN RAISE EXCEPTION 'Conservar caja original de aplicación NC.' USING ERRCODE='22023'; END IF;
  RETURN anterior;
 END IF;
 kid:=(plan->>'kiosco_id')::uuid;usuario:=(plan->>'usuario_id')::uuid;importe:=(plan->>'importe')::numeric;
 reposicion:=public.aplicar_reposicion_historica_piloto(p_caso,p_venta,kid,usuario,plan->'fisicos');
 resultado:=jsonb_build_object('version',1,'estado','APLICACION_NC_REGISTRADA','id',p_caso,'venta_id',p_venta,'operacion_origen_id',p_operacion,'solicitud_sha256',plan->'solicitud_sha256','kiosco_id',kid,'sesion_caja_id',p_caja,'importe',plan->'importe','detalles',plan->'detalles','stock',reposicion->'stock','emision_habilitada',false,'nuevo_reintegro',false);
 INSERT INTO public.fiscal_nc_aplicaciones_homologacion(solicitud_id,venta_id,operacion_origen_id,kiosco_id,usuario_id,actor_auth_id,propuesta_sha256,solicitud_sha256,sesion_caja_id,importe,resultado)
 VALUES(p_caso,p_venta,p_operacion,kid,usuario,p_actor,p_sha,plan->>'solicitud_sha256',p_caja,importe,resultado);
 INSERT INTO public.devoluciones_venta(id,venta_id,kiosco_id,usuario_id,metodo_reintegro,motivo,monto_total,notas)
 VALUES(p_caso,p_venta,kid,usuario,'EFECTIVO_CAJA',plan->>'motivo',importe,'NC homologación '||p_caso::text);
 GET DIAGNOSTICS filas=ROW_COUNT;IF filas<>1 THEN RAISE EXCEPTION 'Cabecera NC no confirmada.'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(plan->'detalles') LOOP
  SELECT precio_unitario INTO STRICT precio FROM public.detalles_venta WHERE id=(d->>'detalle_id')::uuid AND venta_id=p_venta;
  INSERT INTO public.detalles_devolucion(devolucion_id,detalle_venta_id,producto_id,cantidad,precio_unitario,subtotal,reingresa_stock)
  VALUES(p_caso,(d->>'detalle_id')::uuid,(d->>'producto_id')::uuid,(d->>'cantidad')::numeric,precio,(d->>'importe')::numeric,(d->>'reingresa_stock')::boolean);
  GET DIAGNOSTICS filas=ROW_COUNT;IF filas<>1 THEN RAISE EXCEPTION 'Detalle NC no confirmado.'; END IF;
 END LOOP;
 INSERT INTO public.movimientos_caja(id,kiosco_id,sesion_caja_id,usuario_id,tipo,motivo,monto,descripcion)
 VALUES(p_caso,kid,p_caja,usuario,'EGRESO','DEVOLUCION_VENTA',importe,'NC homologación '||p_caso::text);
 GET DIAGNOSTICS filas=ROW_COUNT;IF filas<>1 THEN RAISE EXCEPTION 'Reintegro NC no confirmado.'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(reposicion->'reposiciones') LOOP
  INSERT INTO public.fiscal_nc_reposiciones_homologacion(solicitud_id,movimiento_original_id,movimiento_nuevo_id,cantidad,costo_unitario)
  VALUES(p_caso,(r->>'movimiento_id')::uuid,(r->>'movimiento_nuevo_id')::uuid,(r->>'cantidad')::numeric,(r->>'costo_unitario')::numeric);
 END LOOP;
 RETURN public.cargar_aplicacion_comercial_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
END $$;
REVOKE ALL ON FUNCTION public.cargar_aplicacion_comercial_nc_homologacion(uuid,uuid,uuid,uuid,text),public.aplicar_comercial_nc_homologacion(uuid,uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_aplicacion_comercial_nc_homologacion(uuid,uuid,uuid,uuid,text),public.aplicar_comercial_nc_homologacion(uuid,uuid,uuid,uuid,text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.proteger_devolucion_venta_vigente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  -- The private worker preserves the captured Auth identity; never impersonate auth.uid().
  IF TG_OP='INSERT' AND EXISTS(
    SELECT 1 FROM public.fiscal_nc_aplicaciones_homologacion a
    JOIN public.usuarios u ON u.id=a.usuario_id AND u.auth_user_id=a.actor_auth_id
    WHERE a.solicitud_id=NEW.id AND a.venta_id=NEW.venta_id AND a.kiosco_id=NEW.kiosco_id
      AND a.usuario_id=NEW.usuario_id AND a.importe=NEW.monto_total
      AND NEW.metodo_reintegro='EFECTIVO_CAJA' AND u.activo AND u.rol='DUEÑO' AND u.kiosco_id=a.kiosco_id
  ) THEN
    PERFORM 1 FROM public.ventas WHERE id=NEW.venta_id AND kiosco_id=NEW.kiosco_id AND estado='COMPLETADA' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La venta no admite devoluciones.' USING ERRCODE='22023'; END IF;
    RETURN NEW;
  END IF;
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

-- Las restricciones de factura original012 y reserva010 siguen bloqueando refacturación.
COMMIT;
