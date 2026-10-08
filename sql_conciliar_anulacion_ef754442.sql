-- Reparación específica del duplicado confirmado por el usuario, NO genérica.
-- Aplicar primero la fase de anulación actualizada (retira el trigger legado).
-- Conserva los ingresos originales y agrega un egreso compensatorio auditado.
-- Si cambió stock o hay movimientos posteriores, aborta: no adivina cantidades.
BEGIN;
DO $$
DECLARE
  v_venta constant uuid:='ef754442-ec79-480c-844e-4091d1ff71ea';
  v_kiosco constant uuid:='614a2e8c-2488-4caa-a95a-22a04db115b8';
  v_producto constant uuid:='de9823cd-2bcf-4005-9e1f-ca88ead0a9a2';
  v_duplicado constant uuid:='52f05b1f-820f-47bd-9f33-87a41d6d9cbb';
  v_original constant uuid:='5ab96f45-f1f8-4337-80a0-06501a0dcec5';
  confirmacion public.anulaciones_venta_atomicas%ROWTYPE;
  stock_antes numeric; stock_despues numeric; costo numeric; movimiento uuid; filas integer;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.ventas'::regclass
    AND tgname='trg_devolver_stock_anulacion' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Aplicá primero la fase de anulación actualizada para retirar el trigger legado.';
  END IF;
  SELECT * INTO STRICT confirmacion FROM public.anulaciones_venta_atomicas
    WHERE venta_id=v_venta AND kiosco_id=v_kiosco FOR UPDATE;
  PERFORM 1 FROM public.ventas WHERE id=v_venta AND kiosco_id=v_kiosco AND estado='ANULADA' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta anulada no disponible.'; END IF;
  SELECT stock_actual INTO STRICT stock_antes FROM public.productos
    WHERE id=v_producto AND kiosco_id=v_kiosco FOR UPDATE;
  -- Repetir el mismo script no vuelve a descontar, incluso si luego hubo ventas.
  IF EXISTS(SELECT 1 FROM public.auditoria_operaciones WHERE kiosco_id=v_kiosco
    AND accion='CONCILIACION_STOCK_DUPLICADO' AND entidad='movimientos_stock' AND entidad_id=v_duplicado) THEN
    RAISE NOTICE 'La conciliación ya quedó registrada; no se repite.';
    RETURN;
  END IF;
  IF stock_antes IS DISTINCT FROM 18 OR NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(confirmacion.resultado->'stock') e
    WHERE e->>'producto_id'=v_producto::text AND (e->>'stock_actual')::numeric=17) THEN
    RAISE EXCEPTION 'El stock o resultado cambió; requiere una nueva conciliación.';
  END IF;
  IF (SELECT count(*) FROM public.movimientos_stock WHERE id IN(v_original,v_duplicado)
      AND kiosco_id=v_kiosco AND producto_id=v_producto AND tipo='INGRESO' AND motivo='DEVOLUCION'
      AND cantidad=1 AND lote_producto_id IS NULL AND fecha=confirmacion.creado_en)=2
    AND EXISTS(SELECT 1 FROM public.movimientos_stock WHERE id=v_original AND notas='Anulación atómica '||v_venta::text)
    AND EXISTS(SELECT 1 FROM public.movimientos_stock WHERE id=v_duplicado AND notas='Devolución por anulación de venta '||v_venta::text) THEN
    NULL;
  ELSE RAISE EXCEPTION 'Los movimientos no coinciden con el duplicado diagnosticado.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.movimientos_stock WHERE kiosco_id=v_kiosco AND producto_id=v_producto
    AND (fecha IS NULL OR fecha>=confirmacion.creado_en) AND id NOT IN(v_original,v_duplicado)) THEN
    RAISE EXCEPTION 'Hay movimientos posteriores o simultáneos; revisar antes de conciliar.';
  END IF;
  SELECT precio_costo INTO STRICT costo FROM public.movimiento_stock_costos
    WHERE movimiento_id=v_original AND kiosco_id=v_kiosco;
  IF costo IS NOT NULL AND (costo::text IN ('NaN','Infinity','-Infinity') OR costo<0 OR round(costo,2)<>costo) THEN
    RAISE EXCEPTION 'Costo histórico inválido; revisar antes de conciliar.';
  END IF;
  UPDATE public.productos SET stock_actual=stock_actual-1,fecha_actualizacion=now()
    WHERE id=v_producto AND kiosco_id=v_kiosco RETURNING stock_actual INTO stock_despues;
  IF NOT FOUND OR stock_despues IS DISTINCT FROM 17 THEN RAISE EXCEPTION 'No se confirmó el stock conciliado.'; END IF;
  INSERT INTO public.movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas,fecha,lote_producto_id)
    VALUES(v_kiosco,v_producto,'EGRESO',1,'DEVOLUCION',
      'Conciliación del ingreso duplicado '||v_duplicado::text||' por anulación '||v_venta::text,now(),NULL)
    RETURNING id INTO movimiento;
  IF movimiento IS NULL THEN RAISE EXCEPTION 'No se confirmó el movimiento compensatorio.'; END IF;
  UPDATE public.movimiento_stock_costos SET precio_costo=costo
    WHERE movimiento_id=movimiento AND kiosco_id=v_kiosco;
  GET DIAGNOSTICS filas=ROW_COUNT;
  IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó el costo histórico de la conciliación.'; END IF;
  -- SQL Editor no representa la sesión Auth de un cajero: no inventar actor.
  INSERT INTO public.auditoria_operaciones(kiosco_id,actor_auth_id,actor_rol,accion,entidad,entidad_id,motivo)
    VALUES(v_kiosco,auth.uid(),'SQL_EDITOR:'||current_user,'CONCILIACION_STOCK_DUPLICADO','movimientos_stock',v_duplicado,
      jsonb_build_object('venta_id',v_venta,'movimiento_compensatorio',movimiento,
        'cantidad',1,'stock_antes',stock_antes,'stock_despues',stock_despues)::text);
  GET DIAGNOSTICS filas=ROW_COUNT;
  IF filas<>1 THEN RAISE EXCEPTION 'No se confirmó la auditoría de conciliación.'; END IF;
END $$;
COMMIT;
SELECT p.id,p.descripcion,p.stock_actual,
  (SELECT count(*) FROM public.auditoria_operaciones a WHERE a.kiosco_id=p.kiosco_id
    AND a.accion='CONCILIACION_STOCK_DUPLICADO' AND a.entidad='movimientos_stock'
    AND a.entidad_id='52f05b1f-820f-47bd-9f33-87a41d6d9cbb'::uuid) AS conciliaciones
FROM public.productos p WHERE p.id='de9823cd-2bcf-4005-9e1f-ca88ead0a9a2'::uuid
  AND p.kiosco_id='614a2e8c-2488-4caa-a95a-22a04db115b8'::uuid;
