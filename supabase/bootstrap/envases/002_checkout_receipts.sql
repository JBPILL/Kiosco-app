-- Install after 001_shared_ledger.sql. New Edge flag must remain off until hosted acceptance.
BEGIN;
ALTER TABLE public.detalles_venta DROP CONSTRAINT IF EXISTS detalles_venta_subtotal_check;
ALTER TABLE public.detalles_venta DROP CONSTRAINT IF EXISTS detalles_venta_subtotal_envases_check;
ALTER TABLE public.detalles_venta ADD CONSTRAINT detalles_venta_subtotal_envases_check
  CHECK(subtotal>=0 OR (es_devolucion_envase AND precio_unitario=0));
ALTER TABLE public.envases_movimientos DROP CONSTRAINT IF EXISTS envases_movimientos_accion_check;
ALTER TABLE public.envases_movimientos ADD CONSTRAINT envases_movimientos_accion_check
  CHECK(accion IN ('AJUSTAR_SALDO','ENTREGAR_DISTRIBUIDOR','RECIBIR_EFECTIVO','RECIBIR_TICKET'));
CREATE TABLE IF NOT EXISTS public.envases_checkout_operaciones (
  checkout_id uuid PRIMARY KEY REFERENCES public.ventas(id),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  actor_auth_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  resultado jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.envases_checkout_operaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.envases_checkout_operaciones FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE cols text; r text; BEGIN
  SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid='public.envases_checkout_operaciones'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.envases_checkout_operaciones FROM PUBLIC,anon,authenticated,service_role',cols,cols,cols,cols);
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(r,'public.envases_checkout_operaciones','INSERT,UPDATE,DELETE')
      OR has_any_column_privilege(r,'public.envases_checkout_operaciones','SELECT,INSERT,UPDATE') THEN
      RAISE EXCEPTION 'Acceso heredado al registro privado de checkout/envases';
    END IF;
  END LOOP;
END $$;
-- Server-side quote reads only catalog metadata, never local browser stock/cost.
GRANT SELECT(id,kiosco_id,nombre,precio,activo) ON public.envases_tipos_comercio TO service_role;
DROP POLICY IF EXISTS envases_cotizacion_servidor ON public.envases_tipos_comercio;
CREATE POLICY envases_cotizacion_servidor ON public.envases_tipos_comercio FOR SELECT TO service_role USING(true);

CREATE OR REPLACE FUNCTION public.confirmar_checkout_envases(p_actor_auth_id uuid,p_snapshot jsonb,p_autorizado boolean DEFAULT false,p_autorizacion_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
<<checkout_envases>>
DECLARE actor public.usuarios%ROWTYPE; e public.checkout_manual_entradas%ROWTYPE;
  previa public.envases_checkout_operaciones%ROWTYPE; catalogo public.envases_tipos_comercio%ROWTYPE;
  checkout_id uuid; kid uuid; caja uuid; linea jsonb; detalle jsonb; r record;
  movimientos jsonb:='[]'::jsonb; resultado jsonb; item jsonb; op_id uuid;
  cantidad numeric; precio numeric; importe numeric; saldo integer; confirmado integer; filas integer; n integer:=0;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Se requiere servidor de cobro' USING ERRCODE='42501'; END IF;
  checkout_id:=public.checkout_uuid(p_snapshot->'id');
  PERFORM pg_advisory_xact_lock(hashtextextended('checkout-manual:'||checkout_id::text,0));
  BEGIN SELECT * INTO STRICT actor FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Actor de checkout no autorizado' USING ERRCODE='42501'; END;
  IF actor.kiosco_id IS NULL OR actor.rol IS NULL OR actor.rol NOT IN ('DUEÑO','CAJERO') THEN RAISE EXCEPTION 'Rol de checkout no autorizado' USING ERRCODE='42501'; END IF;
  kid:=actor.kiosco_id;
  SELECT * INTO previa FROM public.envases_checkout_operaciones c WHERE c.checkout_id=checkout_envases.checkout_id;
  IF FOUND THEN
    IF previa.kiosco_id IS DISTINCT FROM kid OR previa.snapshot IS DISTINCT FROM p_snapshot
      OR (previa.actor_auth_id IS DISTINCT FROM p_actor_auth_id AND actor.rol<>'DUEÑO') THEN
      RAISE EXCEPTION 'Conservá la solicitud original del checkout con envases' USING ERRCODE='22023';
    END IF;
    RETURN previa.resultado;
  END IF;
  SELECT * INTO e FROM public.checkout_manual_entradas WHERE id=checkout_id AND kiosco_id=kid FOR SHARE;
  IF NOT FOUND OR e.snapshot IS DISTINCT FROM p_snapshot
    OR (actor.rol='CAJERO' AND e.usuario_id IS DISTINCT FROM actor.id) THEN
    RAISE EXCEPTION 'Falta cotización congelada de envases autorizada' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.checkout_manuales m WHERE m.id=checkout_id AND m.resultado IS NOT NULL) THEN
    RAISE EXCEPTION 'Venta anterior sin ledger de envases; requiere conciliación';
  END IF;
  PERFORM public.exigir_comercio_operativo(kid);
  PERFORM public.exigir_capacidad_operativa_piloto(kid,'ENVASES');
  caja:=(p_snapshot->>'sesion_caja_id')::uuid;
  PERFORM 1 FROM public.sesiones_caja WHERE id=caja AND kiosco_id=kid AND estado='ABIERTA' AND fecha_cierre IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Se requiere caja abierta del comercio'; END IF;
  -- Stable type order and same cash-before-type ordering as standalone receipts.
  FOR linea IN SELECT value FROM jsonb_array_elements(e.entrada->'lineas') WHERE value->>'tipo'='DEVOLUCION_ENVASE' ORDER BY value->>'envaseId',value->>'id' LOOP
    n:=n+1;
    PERFORM pg_advisory_xact_lock(hashtextextended('envases-tipo:'||kid::text||':'||(linea->>'envaseId'),0));
    SELECT * INTO catalogo FROM public.envases_tipos_comercio t WHERE t.kiosco_id=kid AND t.id=linea->>'envaseId' FOR UPDATE;
    IF NOT FOUND OR NOT catalogo.activo THEN RAISE EXCEPTION 'Tipo de envase no disponible'; END IF;
    SELECT value INTO STRICT detalle FROM jsonb_array_elements(p_snapshot->'detalles') WHERE value->>'producto_id'=linea->>'id';
    cantidad:=(linea->>'cantidad')::numeric; precio:=(detalle->>'precio_envase_unitario')::numeric;
    IF cantidad<1 OR cantidad>999999 OR cantidad<>trunc(cantidad) OR cantidad IS DISTINCT FROM (detalle->>'cantidad')::numeric
      OR (detalle->>'es_devolucion_envase')::boolean IS DISTINCT FROM true
      OR precio<=0 OR precio>9999999999.99 OR precio<>round(precio,2)
      OR precio::text IN ('NaN','Infinity','-Infinity')
      OR (detalle#>>'{articulo_libre,precio_venta}')::numeric IS DISTINCT FROM -precio
      OR (detalle->>'subtotal')::numeric IS DISTINCT FROM -(cantidad*precio)
      OR (cantidad*precio)<>trunc(cantidad*precio) THEN
      RAISE EXCEPTION 'Reconocimiento de envases incompatible con la cotización congelada';
    END IF;
    movimientos:=movimientos||jsonb_build_array(jsonb_build_object('tipo_id',catalogo.id,'cantidad',cantidad,'importe',cantidad*precio));
  END LOOP;
  IF n=0 OR n<>(SELECT count(*) FROM jsonb_array_elements(p_snapshot->'detalles') d WHERE (d->>'es_devolucion_envase')::boolean) THEN
    RAISE EXCEPTION 'Las recepciones no coinciden con el ticket preparado';
  END IF;
  IF p_autorizado IS TRUE THEN
    resultado:=public.confirmar_venta_manual_autorizada(p_actor_auth_id,e.entrada,p_snapshot,p_autorizacion_id);
  ELSE
    resultado:=public.confirmar_venta_manual(p_actor_auth_id,p_snapshot);
  END IF;
  FOR r IN SELECT value->>'tipo_id' tipo_id,sum((value->>'cantidad')::numeric) cantidad,sum((value->>'importe')::numeric) importe
    FROM jsonb_array_elements(movimientos) GROUP BY 1 ORDER BY 1 LOOP
    INSERT INTO public.envases_saldos(kiosco_id,tipo_id) VALUES(kid,r.tipo_id) ON CONFLICT DO NOTHING;
    SELECT s.cantidad INTO saldo FROM public.envases_saldos s WHERE s.kiosco_id=kid AND s.tipo_id=r.tipo_id FOR UPDATE;
    IF NOT FOUND OR saldo+r.cantidad>999999999 THEN RAISE EXCEPTION 'Saldo de envases fuera de rango'; END IF;
    UPDATE public.envases_saldos s SET cantidad=s.cantidad+r.cantidad,actualizado_en=now()
      WHERE s.kiosco_id=kid AND s.tipo_id=r.tipo_id RETURNING s.cantidad INTO confirmado;
    IF NOT FOUND OR confirmado IS DISTINCT FROM saldo+r.cantidad THEN RAISE EXCEPTION 'No se confirmó el saldo de envases del ticket'; END IF;
    op_id:=gen_random_uuid();
    INSERT INTO public.envases_operaciones(id,kiosco_id,actor_auth_id,solicitud,resultado)
      VALUES(op_id,kid,p_actor_auth_id,jsonb_build_object('version',1,'id',op_id,'accion','RECIBIR_TICKET','tipoId',r.tipo_id,'checkout_id',checkout_id),
        jsonb_build_object('id',op_id,'checkout_id',checkout_id,'stock_vacios',confirmado,'importe',r.importe));
    GET DIAGNOSTICS filas=ROW_COUNT;
    IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el ledger de envases del ticket'; END IF;
    INSERT INTO public.envases_movimientos(id,kiosco_id,tipo_id,usuario_id,accion,cantidad,stock_resultante,importe,notas)
      VALUES(op_id,kid,r.tipo_id,actor.id,'RECIBIR_TICKET',r.cantidad,confirmado,r.importe,'Checkout manual '||checkout_id::text);
    GET DIAGNOSTICS filas=ROW_COUNT;
    IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el movimiento de envases del ticket'; END IF;
  END LOOP;
  INSERT INTO public.envases_checkout_operaciones(checkout_id,kiosco_id,actor_auth_id,snapshot,resultado)
    VALUES(checkout_id,kid,p_actor_auth_id,p_snapshot,resultado);
  GET DIAGNOSTICS filas=ROW_COUNT;
  IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó la relación del ticket con los envases'; END IF;
  RETURN resultado;
END $$;
ALTER FUNCTION public.confirmar_checkout_envases(uuid,jsonb,boolean,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.confirmar_checkout_envases(uuid,jsonb,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_checkout_envases(uuid,jsonb,boolean,uuid) TO service_role;

-- Existing annulment cannot silently keep empties already credited in the ticket.
CREATE OR REPLACE FUNCTION public.bloquear_anulacion_envases_sin_reversion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.estado='ANULADA' AND OLD.estado IS DISTINCT FROM 'ANULADA'
    AND EXISTS(SELECT 1 FROM public.envases_checkout_operaciones WHERE checkout_id=NEW.id) THEN
    RAISE EXCEPTION 'Este ticket recibió envases; requiere conciliar los vacíos antes de anular';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bloquear_anulacion_envases_sin_reversion() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS anular_envases_requiere_reversion ON public.ventas;
CREATE TRIGGER anular_envases_requiere_reversion BEFORE UPDATE OF estado ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.bloquear_anulacion_envases_sin_reversion();
NOTIFY pgrst,'reload schema';
COMMIT;
