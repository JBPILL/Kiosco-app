-- F6 incremental hardening. Review target and back up before explicit application.
-- Replaces only guardar_producto_transaccional; preserves existing grants.
BEGIN;
CREATE OR REPLACE FUNCTION public.guardar_producto_transaccional(
  p_operacion_id uuid, p_producto_id uuid, p_datos jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE
  a record; op public.operaciones_escritura%ROWTYPE; req jsonb;
  p public.productos%ROWTYPE; stock_objetivo numeric(12,3); v_stock_actual numeric(12,3);
  costo numeric(12,2); costo_anterior numeric(12,2); venta_anterior numeric(12,2); salida jsonb; existe boolean;
  permitidas text[] := ARRAY['codigo_barras','descripcion','precio_costo','precio_venta','stock_actual',
    'stock_minimo','categoria_id','unidad_medida','es_pesable','plu_balanza','es_combo','es_retornable',
    'precio_envase','nombre_envase','requiere_vencimiento','dias_alerta_vencimiento','activo','es_favorito','motivo_cambio_precio'];
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF p_operacion_id IS NULL OR p_producto_id IS NULL OR coalesce(jsonb_typeof(p_datos),'')<>'object'
     OR p_datos - permitidas <> '{}'::jsonb THEN RAISE EXCEPTION 'Datos de producto inválidos' USING ERRCODE='22023'; END IF;
  IF p_datos ? 'descripcion' AND length(btrim(coalesce(p_datos->>'descripcion',''))) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'Descripción inválida' USING ERRCODE='22023'; END IF;
  IF p_datos ? 'precio_venta' AND ((p_datos->>'precio_venta')::numeric<0 OR (p_datos->>'precio_venta')::numeric<>round((p_datos->>'precio_venta')::numeric,2)) THEN RAISE EXCEPTION 'Precio de venta inválido' USING ERRCODE='22023'; END IF;
  IF p_datos ? 'precio_costo' AND a.rol<>'DUEÑO' AND NOT a.es_superadmin THEN RAISE EXCEPTION 'Sólo el dueño puede definir costos' USING ERRCODE='42501'; END IF;
  IF p_datos ? 'motivo_cambio_precio' AND a.rol<>'DUEÑO' AND NOT a.es_superadmin THEN RAISE EXCEPTION 'Sólo el dueño puede auditar cambios de precio' USING ERRCODE='42501'; END IF;
  IF length(coalesce(p_datos->>'motivo_cambio_precio',''))>300 THEN RAISE EXCEPTION 'Motivo del cambio demasiado extenso' USING ERRCODE='22023'; END IF;
  IF p_datos ? 'stock_actual' AND ((p_datos->>'stock_actual')::numeric<0 OR (p_datos->>'stock_actual')::numeric<>round((p_datos->>'stock_actual')::numeric,3)) THEN RAISE EXCEPTION 'Stock inicial inválido' USING ERRCODE='22023'; END IF;
  IF p_datos ? 'categoria_id' AND p_datos->>'categoria_id' IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.categorias c WHERE c.id=(p_datos->>'categoria_id')::uuid AND c.kiosco_id=a.kiosco_id
  ) THEN RAISE EXCEPTION 'Categoría no disponible para este comercio' USING ERRCODE='42501'; END IF;
  req:=jsonb_build_object('producto',p_producto_id,'datos',p_datos);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'CATALOGO_PRODUCTO',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'CATALOGO_PRODUCTO' OR op.solicitud<>req THEN RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023'; END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  SELECT * INTO p FROM public.productos WHERE id=p_producto_id AND kiosco_id=a.kiosco_id FOR UPDATE;
  existe:=FOUND;
  IF NOT existe AND a.rol<>'DUEÑO' AND NOT a.es_superadmin THEN
    RAISE EXCEPTION 'Sólo el dueño puede registrar productos' USING ERRCODE='42501';
  END IF;
  IF NOT existe AND EXISTS(SELECT 1 FROM public.productos WHERE id=p_producto_id) THEN RAISE EXCEPTION 'Producto fuera del comercio autorizado' USING ERRCODE='42501'; END IF;
  IF existe THEN
    IF a.rol<>'DUEÑO' AND NOT a.es_superadmin THEN RAISE EXCEPTION 'Sólo el dueño puede editar productos existentes' USING ERRCODE='42501'; END IF;
    venta_anterior:=p.precio_venta;
    SELECT pc.precio_costo INTO costo_anterior FROM public.producto_costos pc WHERE pc.producto_id=p_producto_id AND pc.kiosco_id=a.kiosco_id;
  END IF;
  stock_objetivo:=CASE WHEN p_datos ? 'stock_actual' THEN (p_datos->>'stock_actual')::numeric ELSE NULL END;
  IF NOT existe THEN
    IF NOT (p_datos ? 'descripcion' AND p_datos ? 'precio_venta') THEN RAISE EXCEPTION 'Faltan campos obligatorios del producto' USING ERRCODE='22023'; END IF;
    INSERT INTO public.productos(id,kiosco_id,codigo_barras,descripcion,precio_venta,precio_costo,stock_actual,stock_minimo,
      categoria_id,unidad_medida,es_pesable,plu_balanza,es_combo,es_retornable,precio_envase,nombre_envase,
      requiere_vencimiento,dias_alerta_vencimiento,activo,es_favorito)
    VALUES(p_producto_id,a.kiosco_id,NULLIF(btrim(p_datos->>'codigo_barras'),''),btrim(p_datos->>'descripcion'),
      coalesce((p_datos->>'precio_venta')::numeric,0),coalesce((p_datos->>'precio_costo')::numeric,0),0,
      coalesce((p_datos->>'stock_minimo')::numeric,0),NULLIF(p_datos->>'categoria_id','')::uuid,
      coalesce(p_datos->>'unidad_medida','UN'),coalesce((p_datos->>'es_pesable')::boolean,false),NULLIF(p_datos->>'plu_balanza',''),
      coalesce((p_datos->>'es_combo')::boolean,false),coalesce((p_datos->>'es_retornable')::boolean,false),
      coalesce((p_datos->>'precio_envase')::numeric,0),NULLIF(p_datos->>'nombre_envase',''),
      coalesce((p_datos->>'requiere_vencimiento')::boolean,false),coalesce((p_datos->>'dias_alerta_vencimiento')::integer,15),
      coalesce((p_datos->>'activo')::boolean,true),coalesce((p_datos->>'es_favorito')::boolean,false)) RETURNING * INTO p;
  ELSE
    IF p_datos ? 'descripcion' THEN p.descripcion:=btrim(p_datos->>'descripcion'); END IF;
    IF p_datos ? 'codigo_barras' THEN p.codigo_barras:=NULLIF(btrim(p_datos->>'codigo_barras'),''); END IF;
    IF p_datos ? 'precio_venta' THEN p.precio_venta:=(p_datos->>'precio_venta')::numeric; END IF;
    IF p_datos ? 'precio_costo' THEN p.precio_costo:=(p_datos->>'precio_costo')::numeric; END IF;
    IF p_datos ? 'stock_minimo' THEN p.stock_minimo:=(p_datos->>'stock_minimo')::numeric; END IF;
    IF p_datos ? 'categoria_id' THEN p.categoria_id:=NULLIF(p_datos->>'categoria_id','')::uuid; END IF;
    IF p_datos ? 'unidad_medida' THEN p.unidad_medida:=p_datos->>'unidad_medida'; END IF;
    IF p_datos ? 'es_pesable' THEN p.es_pesable:=(p_datos->>'es_pesable')::boolean; END IF;
    IF p_datos ? 'plu_balanza' THEN p.plu_balanza:=NULLIF(p_datos->>'plu_balanza',''); END IF;
    IF p_datos ? 'es_combo' THEN p.es_combo:=(p_datos->>'es_combo')::boolean; END IF;
    IF p_datos ? 'es_retornable' THEN p.es_retornable:=(p_datos->>'es_retornable')::boolean; END IF;
    IF p_datos ? 'precio_envase' THEN p.precio_envase:=(p_datos->>'precio_envase')::numeric; END IF;
    IF p_datos ? 'nombre_envase' THEN p.nombre_envase:=NULLIF(p_datos->>'nombre_envase',''); END IF;
    IF p_datos ? 'requiere_vencimiento' THEN p.requiere_vencimiento:=(p_datos->>'requiere_vencimiento')::boolean; END IF;
    IF p_datos ? 'dias_alerta_vencimiento' THEN p.dias_alerta_vencimiento:=(p_datos->>'dias_alerta_vencimiento')::integer; END IF;
    IF p_datos ? 'activo' THEN p.activo:=(p_datos->>'activo')::boolean; END IF;
    IF p_datos ? 'es_favorito' THEN p.es_favorito:=(p_datos->>'es_favorito')::boolean; END IF;
    UPDATE public.productos SET codigo_barras=p.codigo_barras,descripcion=p.descripcion,precio_venta=p.precio_venta,
      precio_costo=p.precio_costo,stock_minimo=p.stock_minimo,categoria_id=p.categoria_id,unidad_medida=p.unidad_medida,
      es_pesable=p.es_pesable,plu_balanza=p.plu_balanza,es_combo=p.es_combo,es_retornable=p.es_retornable,
      precio_envase=p.precio_envase,nombre_envase=p.nombre_envase,requiere_vencimiento=p.requiere_vencimiento,
      dias_alerta_vencimiento=p.dias_alerta_vencimiento,activo=p.activo,es_favorito=p.es_favorito,fecha_actualizacion=now()
      WHERE id=p.id AND kiosco_id=a.kiosco_id RETURNING * INTO p;
  END IF;
  IF stock_objetivo IS NOT NULL THEN
    SELECT pr.stock_actual INTO v_stock_actual FROM public.productos pr WHERE pr.id=p.id FOR UPDATE;
    IF stock_objetivo<>v_stock_actual THEN
      PERFORM public.registrar_movimiento_stock_idempotente(md5(p_operacion_id::text||':stock')::uuid,p.id,'AJUSTE',stock_objetivo,'AJUSTE_MANUAL','Stock inicial/ajuste desde catálogo',NULL,NULL,NULL);
    END IF;
  END IF;
  SELECT * INTO p FROM public.productos WHERE id=p_producto_id AND kiosco_id=a.kiosco_id;
  SELECT pc.precio_costo INTO costo FROM public.producto_costos pc WHERE pc.producto_id=p.id AND pc.kiosco_id=a.kiosco_id;
  IF p_datos ? 'precio_venta' OR p_datos ? 'precio_costo' THEN
    IF venta_anterior IS DISTINCT FROM p.precio_venta OR costo_anterior IS DISTINCT FROM coalesce(costo,0) THEN
      INSERT INTO public.historial_precios_producto(kiosco_id,producto_id,usuario_id,operacion_id,
        precio_venta_anterior,precio_venta_nuevo,precio_costo_anterior,precio_costo_nuevo,motivo)
      VALUES(a.kiosco_id,p.id,a.usuario_id,p_operacion_id,venta_anterior,p.precio_venta,costo_anterior,
        coalesce(costo,0),coalesce(nullif(btrim(p_datos->>'motivo_cambio_precio'),''),'Actualización de catálogo'));
    END IF;
  END IF;
  salida:=jsonb_build_object('producto',to_jsonb(p),'precio_costo',coalesce(costo,0));
  UPDATE public.operaciones_escritura SET resultado=salida WHERE id=p_operacion_id;
  RETURN salida;
END;
$$;
COMMIT;
