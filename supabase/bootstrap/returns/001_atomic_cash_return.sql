-- Optional module, NOT part of the historical bootstrap manifest.
-- Prerequisites: commercial gate and the three private partial-return SQL files.
BEGIN;
DO $$ BEGIN
  IF to_regprocedure('public.preparar_devolucion_parcial_privada(jsonb)') IS NULL
    OR to_regprocedure('public.exigir_comercio_operativo(uuid)') IS NULL
    OR to_regprocedure('public.exigir_capacidad_operativa_piloto(uuid,text)') IS NULL THEN RAISE EXCEPTION 'Faltan requisitos de devolución atómica'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.devoluciones_venta'::regclass AND attname='monto_total' AND NOT attisdropped)
    AND EXISTS(SELECT 1 FROM public.devoluciones_venta) THEN
    RAISE EXCEPTION 'Hay devoluciones antiguas sin importes verificables; conciliar antes de instalar';
  END IF;
END $$;
ALTER TABLE public.devoluciones_venta
  ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS fecha_hora timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS metodo_reintegro text,
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS monto_total numeric(12,2) NOT NULL DEFAULT 0 CHECK(monto_total>=0),
  ADD COLUMN IF NOT EXISTS notas text;
CREATE TABLE IF NOT EXISTS public.detalles_devolucion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucion_id uuid NOT NULL REFERENCES public.devoluciones_venta(id),
  detalle_venta_id uuid REFERENCES public.detalles_venta(id),
  producto_id uuid REFERENCES public.productos(id),
  cantidad numeric(12,3) NOT NULL CHECK(cantidad>0),
  precio_unitario numeric(12,2) NOT NULL CHECK(precio_unitario>=0),
  subtotal numeric(12,2) NOT NULL CHECK(subtotal>=0),
  reingresa_stock boolean NOT NULL
);
ALTER TABLE public.detalles_devolucion ADD COLUMN IF NOT EXISTS detalle_venta_id uuid REFERENCES public.detalles_venta(id);
CREATE TABLE IF NOT EXISTS public.devolucion_reposiciones_atomicas (
  devolucion_id uuid NOT NULL REFERENCES public.devoluciones_parciales_atomicas(id),
  movimiento_original_id uuid NOT NULL REFERENCES public.movimientos_stock(id),
  cantidad numeric(12,3) NOT NULL CHECK(cantidad>0),
  PRIMARY KEY(devolucion_id,movimiento_original_id)
);
DO $$ DECLARE t text; cols text; r text; BEGIN
  FOREACH t IN ARRAY ARRAY['devoluciones_venta','detalles_devolucion','devolucion_reposiciones_atomicas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
    SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role',cols,cols,cols,cols,t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE') OR has_any_column_privilege(r,'public.'||t,'INSERT,UPDATE') THEN
        RAISE EXCEPTION 'Escritura heredada en devoluciones: % %',t,r;
      END IF;
    END LOOP;
  END LOOP;
END $$;
GRANT SELECT ON public.devoluciones_venta,public.detalles_devolucion TO authenticated;
DROP POLICY IF EXISTS devolucion_piloto_lectura ON public.devoluciones_venta;
CREATE POLICY devolucion_piloto_lectura ON public.devoluciones_venta FOR SELECT TO authenticated USING(kiosco_id=public.auth_user_kiosco_id());
DROP POLICY IF EXISTS devolucion_piloto_aislamiento ON public.devoluciones_venta;
CREATE POLICY devolucion_piloto_aislamiento ON public.devoluciones_venta AS RESTRICTIVE FOR ALL TO authenticated USING(kiosco_id=public.auth_user_kiosco_id());
DROP POLICY IF EXISTS detalle_devolucion_piloto_lectura ON public.detalles_devolucion;
CREATE POLICY detalle_devolucion_piloto_lectura ON public.detalles_devolucion FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.devoluciones_venta d WHERE d.id=devolucion_id AND d.kiosco_id=public.auth_user_kiosco_id()));
DROP POLICY IF EXISTS detalle_devolucion_piloto_aislamiento ON public.detalles_devolucion;
CREATE POLICY detalle_devolucion_piloto_aislamiento ON public.detalles_devolucion AS RESTRICTIVE FOR ALL TO authenticated
  USING(EXISTS(SELECT 1 FROM public.devoluciones_venta d WHERE d.id=devolucion_id AND d.kiosco_id=public.auth_user_kiosco_id()));
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
  FOR r IN SELECT (e->>'producto_id')::uuid producto_id,sum((e->>'cantidad')::numeric) cantidad FROM jsonb_array_elements(elegidos) e GROUP BY 1 ORDER BY 1 LOOP
    SELECT stock_actual INTO anterior_stock FROM public.productos WHERE id=r.producto_id AND kiosco_id=kid FOR UPDATE;
    IF NOT FOUND OR anterior_stock IS NULL OR anterior_stock::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Producto histórico no disponible'; END IF;
    pendiente:=r.cantidad;
    FOR m IN SELECT * FROM public.movimientos_stock WHERE producto_id=r.producto_id AND kiosco_id=kid AND tipo='EGRESO'
      AND motivo='VENTA' AND notas='Checkout manual '||venta_id::text ORDER BY lote_producto_id NULLS LAST,id LOOP
      SELECT m.cantidad-coalesce(sum(cantidad),0) INTO disponible FROM public.devolucion_reposiciones_atomicas WHERE movimiento_original_id=m.id;
      IF disponible<0 THEN RAISE EXCEPTION 'Reposición histórica inconsistente'; END IF;
      tomar:=least(pendiente,disponible);
      IF tomar<=0 THEN CONTINUE; END IF;
      SELECT precio_costo INTO costo FROM public.movimiento_stock_costos WHERE movimiento_id=m.id AND kiosco_id=kid;
      IF NOT FOUND OR costo IS NULL OR costo::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Costo histórico no disponible'; END IF;
      IF m.lote_producto_id IS NOT NULL THEN
        SELECT cantidad_actual INTO lote_antes FROM public.lotes_producto WHERE id=m.lote_producto_id AND producto_id=r.producto_id AND kiosco_id=kid FOR UPDATE;
        IF NOT FOUND OR lote_antes IS NULL OR lote_antes::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Lote histórico no disponible'; END IF;
        UPDATE public.lotes_producto SET cantidad_actual=cantidad_actual+tomar,activo=CASE WHEN cantidad_actual=0 THEN true ELSE activo END
          WHERE id=m.lote_producto_id RETURNING cantidad_actual INTO lote_despues;
        IF NOT FOUND OR lote_despues IS DISTINCT FROM lote_antes+tomar THEN RAISE EXCEPTION 'No se confirmó el lote devuelto'; END IF;
      END IF;
      INSERT INTO public.movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas,usuario_id,lote_producto_id)
        VALUES(kid,r.producto_id,'INGRESO',tomar,'DEVOLUCION','Devolución atómica '||op_id::text,actor.id,m.lote_producto_id)
        RETURNING id INTO movimiento_nuevo;
      IF NOT FOUND THEN RAISE EXCEPTION 'No se confirmó el movimiento de stock devuelto'; END IF;
      UPDATE public.movimiento_stock_costos SET precio_costo=costo WHERE movimiento_id=movimiento_nuevo AND kiosco_id=kid RETURNING precio_costo INTO costo_confirmado;
      IF NOT FOUND OR costo_confirmado IS DISTINCT FROM costo THEN RAISE EXCEPTION 'No se confirmó el costo histórico devuelto'; END IF;
      reposiciones:=reposiciones||jsonb_build_array(jsonb_build_object('movimiento_id',m.id,'cantidad',tomar));
      pendiente:=pendiente-tomar;
      EXIT WHEN pendiente=0;
    END LOOP;
    IF pendiente<>0 THEN RAISE EXCEPTION 'No se puede reponer más stock que las salidas originales'; END IF;
    UPDATE public.productos SET stock_actual=stock_actual+r.cantidad,fecha_actualizacion=now() WHERE id=r.producto_id RETURNING stock_actual INTO nuevo_stock;
    IF nuevo_stock IS DISTINCT FROM anterior_stock+r.cantidad THEN RAISE EXCEPTION 'No se confirmó el stock devuelto'; END IF;
    stocks:=stocks||jsonb_build_array(jsonb_build_object('producto_id',r.producto_id,'stock_actual',nuevo_stock));
  END LOOP;
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
ALTER FUNCTION public.confirmar_devolucion_efectivo_piloto(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.confirmar_devolucion_efectivo_piloto(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_devolucion_efectivo_piloto(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
