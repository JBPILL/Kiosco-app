-- Fuente comercial NC: hechos del cierre confirmado, no permiso para emitir/devolver.
BEGIN;
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
  OR EXISTS(SELECT 1 FROM public.devoluciones_venta WHERE venta_id=venta.id)
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
   IF tipo='COMBO' AND cantidad<>trunc(cantidad) THEN RAISE EXCEPTION 'Combo histórico fraccionado.' USING ERRCODE='22023'; END IF;
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
REVOKE ALL ON FUNCTION public.cargar_fuente_comercial_nc_homologacion(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_fuente_comercial_nc_homologacion(uuid,uuid,uuid) TO service_role;
COMMIT;
