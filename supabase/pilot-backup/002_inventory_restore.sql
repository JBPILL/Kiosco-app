-- Después de 001_contacts_restore.sql y del bootstrap completo. Sin cambios a SQL históricos.
BEGIN;
CREATE OR REPLACE FUNCTION public.restaurar_producto_backup(
  p_operacion_id uuid,p_kiosco_id uuid,p_producto_id uuid,p_datos jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE perfil public.usuarios%ROWTYPE; operacion public.operaciones_escritura%ROWTYPE;
  actor_auth uuid:=auth.uid();
  req jsonb; v_resultado jsonb; producto public.productos%ROWTYPE; proveedor uuid;
  lotes jsonb; item jsonb; lotes_restaurados jsonb:='[]'::jsonb; respuesta_lote jsonb;
BEGIN
  BEGIN
    SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=actor_auth AND activo FOR UPDATE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Se requiere un único dueño activo.' USING ERRCODE='42501';
  END;
  IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin OR perfil.kiosco_id IS DISTINCT FROM p_kiosco_id THEN
    RAISE EXCEPTION 'Sólo el dueño del mismo comercio puede restaurar productos.' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.kioscos WHERE id=p_kiosco_id AND estado_suscripcion='ACTIVO' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio no habilitado.' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_producto_id IS NULL OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object'
    OR octet_length(p_datos::text)>2000000
    OR NOT p_datos ? 'proveedor_id' OR jsonb_typeof(p_datos->'proveedor_id') NOT IN ('string','null') THEN
    RAISE EXCEPTION 'Solicitud de producto inválida.' USING ERRCODE='22023';
  END IF;
  lotes:=coalesce(p_datos->'lotes_backup','[]'::jsonb);
  IF jsonb_typeof(lotes) IS DISTINCT FROM 'array' OR jsonb_array_length(lotes)>5000 THEN
    RAISE EXCEPTION 'Colección de lotes inválida.' USING ERRCODE='22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(lotes) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'producto_id') IS DISTINCT FROM 'string'
      OR (item->>'producto_id')::uuid IS DISTINCT FROM p_producto_id THEN
      RAISE EXCEPTION 'Relación de lote inválida.' USING ERRCODE='22023';
    END IF;
    PERFORM (item->>'id')::uuid;
  END LOOP;
  IF (SELECT count(DISTINCT (value->>'id')::uuid) FROM jsonb_array_elements(lotes))<>jsonb_array_length(lotes) THEN
    RAISE EXCEPTION 'Lotes duplicados.' USING ERRCODE='22023';
  END IF;
  proveedor:=(p_datos->>'proveedor_id')::uuid;
  IF proveedor IS NOT NULL THEN
    PERFORM 1 FROM public.proveedores WHERE id=proveedor AND kiosco_id=p_kiosco_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor ausente o ajeno al comercio.' USING ERRCODE='42501'; END IF;
  END IF;
  req:=jsonb_build_object('producto_id',p_producto_id,'datos',p_datos,'actor_auth_id',actor_auth);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,p_kiosco_id,perfil.id,'BACKUP_PRODUCTO',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO operacion FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF operacion.kiosco_id IS DISTINCT FROM p_kiosco_id OR operacion.usuario_id IS DISTINCT FROM perfil.id
    OR operacion.tipo IS DISTINCT FROM 'BACKUP_PRODUCTO' OR operacion.solicitud IS DISTINCT FROM req THEN
    RAISE EXCEPTION 'La operación ya corresponde a otra solicitud.' USING ERRCODE='22023';
  END IF;
  IF operacion.resultado IS NOT NULL THEN RETURN operacion.resultado; END IF;
  -- La asociación y la escritura de catálogo/stock/costo comparten una transacción.
  v_resultado:=public.guardar_producto_transaccional(md5(p_operacion_id::text||':catalogo')::uuid,
    p_producto_id,p_datos-ARRAY['proveedor_id','lotes_backup']);
  UPDATE public.productos SET proveedor_id=proveedor WHERE id=p_producto_id AND kiosco_id=p_kiosco_id
    RETURNING * INTO producto;
  IF NOT FOUND OR producto.proveedor_id IS DISTINCT FROM proveedor THEN
    RAISE EXCEPTION 'El servidor no confirmó la asociación del producto.' USING ERRCODE='40001';
  END IF;
  -- Sustituir los lotes de esta copia dentro de la misma transacción que su stock.
  -- Desactivar primero evita que el orden de reemplazo produzca un exceso transitorio.
  PERFORM 1 FROM public.lotes_producto l WHERE l.id IN (
    SELECT (value->>'id')::uuid FROM jsonb_array_elements(lotes)) ORDER BY l.id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.lotes_producto l WHERE l.id IN (
      SELECT (value->>'id')::uuid FROM jsonb_array_elements(lotes))
      AND (l.kiosco_id<>p_kiosco_id OR l.producto_id<>p_producto_id)) THEN
    RAISE EXCEPTION 'Lote ajeno al producto o comercio.' USING ERRCODE='42501';
  END IF;
  UPDATE public.lotes_producto l SET activo=false WHERE l.kiosco_id=p_kiosco_id AND l.producto_id=p_producto_id
    AND l.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(lotes));
  FOR item IN SELECT value FROM jsonb_array_elements(lotes) LOOP
    respuesta_lote:=public.restaurar_lote_backup(md5(p_operacion_id::text||':lote:'||(item->>'id'))::uuid,
      p_kiosco_id,(item->>'id')::uuid,item-'id');
    lotes_restaurados:=lotes_restaurados||jsonb_build_array(respuesta_lote->'registro');
  END LOOP;
  IF (SELECT coalesce(sum(l.cantidad_actual),0) FROM public.lotes_producto l
      WHERE l.kiosco_id=p_kiosco_id AND l.producto_id=p_producto_id AND l.activo)>producto.stock_actual
    OR NOT EXISTS(SELECT 1 FROM public.productos p WHERE p.id=p_producto_id AND p.kiosco_id=p_kiosco_id
      AND p.stock_actual=producto.stock_actual) THEN
    RAISE EXCEPTION 'Los lotes no coinciden con el stock físico restaurado.' USING ERRCODE='22023';
  END IF;
  v_resultado:=v_resultado||jsonb_build_object('producto',to_jsonb(producto),'lotes',lotes_restaurados);
  UPDATE public.operaciones_escritura SET resultado=v_resultado WHERE id=p_operacion_id;
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurar_lote_backup(
  p_operacion_id uuid,p_kiosco_id uuid,p_lote_id uuid,p_datos jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE perfil public.usuarios%ROWTYPE; operacion public.operaciones_escritura%ROWTYPE;
  actor_auth uuid:=auth.uid();
  producto public.productos%ROWTYPE; lote public.lotes_producto%ROWTYPE;
  req jsonb; esperado jsonb; persistido jsonb; salida jsonb;
  v_producto_id uuid; inicial numeric; actual numeric; ingreso timestamptz; vencimiento date; v_activo boolean;
BEGIN
  BEGIN
    SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=actor_auth AND activo FOR UPDATE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Se requiere un único dueño activo.' USING ERRCODE='42501';
  END;
  IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin OR perfil.kiosco_id IS DISTINCT FROM p_kiosco_id THEN
    RAISE EXCEPTION 'Sólo el dueño del mismo comercio puede restaurar lotes.' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.kioscos WHERE id=p_kiosco_id AND estado_suscripcion='ACTIVO' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio no habilitado.' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_lote_id IS NULL OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object'
    OR p_datos-ARRAY['producto_id','numero_lote','fecha_vencimiento','cantidad_inicial','cantidad_actual','fecha_ingreso','activo']<>'{}'::jsonb
    OR jsonb_typeof(p_datos->'producto_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_datos->'fecha_vencimiento') IS DISTINCT FROM 'string'
    OR (p_datos->>'fecha_vencimiento') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR jsonb_typeof(p_datos->'cantidad_inicial') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_datos->'cantidad_actual') IS DISTINCT FROM 'number'
    OR (p_datos ? 'numero_lote' AND (jsonb_typeof(p_datos->'numero_lote') NOT IN ('string','null') OR length(p_datos->>'numero_lote')>180))
    OR (p_datos ? 'activo' AND jsonb_typeof(p_datos->'activo') IS DISTINCT FROM 'boolean') THEN
    RAISE EXCEPTION 'Solicitud de lote inválida.' USING ERRCODE='22023';
  END IF;
  inicial:=(p_datos->>'cantidad_inicial')::numeric; actual:=(p_datos->>'cantidad_actual')::numeric;
  vencimiento:=(p_datos->>'fecha_vencimiento')::date; v_producto_id:=(p_datos->>'producto_id')::uuid;
  v_activo:=coalesce((p_datos->>'activo')::boolean,true);
  IF inicial<0 OR inicial>999999999.999 OR actual<0 OR actual>inicial
    OR inicial<>round(inicial,3) OR actual<>round(actual,3) THEN
    RAISE EXCEPTION 'Cantidades de lote inválidas.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO producto FROM public.productos p WHERE p.id=v_producto_id AND p.kiosco_id=p_kiosco_id FOR UPDATE;
  IF NOT FOUND OR producto.es_combo THEN RAISE EXCEPTION 'Producto ausente, ajeno o virtual.' USING ERRCODE='42501'; END IF;
  IF NOT producto.es_pesable AND (inicial<>trunc(inicial) OR actual<>trunc(actual)) THEN
    RAISE EXCEPTION 'El lote por unidad no permite fracciones.' USING ERRCODE='22023';
  END IF;
  req:=jsonb_build_object('lote_id',p_lote_id,'datos',p_datos,'actor_auth_id',actor_auth);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,p_kiosco_id,perfil.id,'BACKUP_LOTE',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO operacion FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF operacion.kiosco_id IS DISTINCT FROM p_kiosco_id OR operacion.usuario_id IS DISTINCT FROM perfil.id
    OR operacion.tipo IS DISTINCT FROM 'BACKUP_LOTE' OR operacion.solicitud IS DISTINCT FROM req THEN
    RAISE EXCEPTION 'La operación ya corresponde a otra solicitud.' USING ERRCODE='22023';
  END IF;
  IF operacion.resultado IS NOT NULL THEN RETURN operacion.resultado; END IF;
  SELECT * INTO lote FROM public.lotes_producto WHERE id=p_lote_id FOR UPDATE;
  IF FOUND AND (lote.kiosco_id IS DISTINCT FROM p_kiosco_id OR lote.producto_id IS DISTINCT FROM v_producto_id) THEN
    RAISE EXCEPTION 'El lote pertenece a otro producto o comercio.' USING ERRCODE='42501';
  END IF;
  ingreso:=coalesce(lote.fecha_ingreso,now());
  IF p_datos ? 'fecha_ingreso' THEN
    IF jsonb_typeof(p_datos->'fecha_ingreso') IS DISTINCT FROM 'string'
      OR (p_datos->>'fecha_ingreso') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
      RAISE EXCEPTION 'Fecha de ingreso inválida.' USING ERRCODE='22023';
    END IF;
    ingreso:=(p_datos->>'fecha_ingreso')::timestamptz;
  END IF;
  IF (SELECT coalesce(sum(l.cantidad_actual),0) FROM public.lotes_producto l
    WHERE l.kiosco_id=p_kiosco_id AND l.producto_id=v_producto_id AND l.activo AND l.id<>p_lote_id)
    + (CASE WHEN v_activo THEN actual ELSE 0 END) > producto.stock_actual THEN
    RAISE EXCEPTION 'Los lotes superan el stock físico restaurado.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.lotes_producto(id,kiosco_id,producto_id,numero_lote,fecha_vencimiento,cantidad_inicial,cantidad_actual,fecha_ingreso,activo)
    VALUES(p_lote_id,p_kiosco_id,v_producto_id,p_datos->>'numero_lote',vencimiento,inicial,actual,ingreso,v_activo)
    ON CONFLICT(id) DO UPDATE SET numero_lote=excluded.numero_lote,fecha_vencimiento=excluded.fecha_vencimiento,
      cantidad_inicial=excluded.cantidad_inicial,cantidad_actual=excluded.cantidad_actual,
      fecha_ingreso=excluded.fecha_ingreso,activo=excluded.activo
    RETURNING to_jsonb(lotes_producto.*) INTO persistido;
  esperado:=jsonb_build_object('id',p_lote_id,'kiosco_id',p_kiosco_id,'producto_id',v_producto_id,
    'numero_lote',p_datos->>'numero_lote','fecha_vencimiento',vencimiento,'cantidad_inicial',inicial,
    'cantidad_actual',actual,'fecha_ingreso',ingreso,'activo',v_activo);
  IF persistido IS NULL OR NOT persistido @> esperado THEN
    RAISE EXCEPTION 'El servidor no confirmó el lote restaurado.' USING ERRCODE='40001';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.productos p WHERE p.id=v_producto_id AND p.kiosco_id=p_kiosco_id AND p.stock_actual=producto.stock_actual) THEN
    RAISE EXCEPTION 'La restauración del lote alteró el stock físico.' USING ERRCODE='40001';
  END IF;
  salida:=jsonb_build_object('id',p_lote_id,'kiosco_id',p_kiosco_id,'registro',persistido);
  UPDATE public.operaciones_escritura SET resultado=salida WHERE id=p_operacion_id;
  RETURN salida;
END;
$$;
REVOKE ALL ON FUNCTION public.restaurar_producto_backup(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurar_lote_backup(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.restaurar_producto_backup(uuid,uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_lote_backup(uuid,uuid,uuid,jsonb) TO authenticated;
COMMIT;
