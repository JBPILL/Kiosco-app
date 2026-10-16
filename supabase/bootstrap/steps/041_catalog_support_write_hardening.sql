-- Strict-pilot catalog and support writes. Browser table DML remains revoked.
BEGIN;

CREATE TABLE public.historial_precios_producto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  operacion_id uuid NOT NULL REFERENCES public.operaciones_escritura(id),
  precio_venta_anterior numeric(12,2), precio_venta_nuevo numeric(12,2) NOT NULL,
  precio_costo_anterior numeric(12,2), precio_costo_nuevo numeric(12,2) NOT NULL,
  motivo text NOT NULL, creado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.historial_precios_producto ENABLE ROW LEVEL SECURITY;
CREATE POLICY historial_precios_producto_owner_read ON public.historial_precios_producto
  FOR SELECT TO authenticated USING (kiosco_id=public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin());
REVOKE ALL ON public.historial_precios_producto FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.historial_precios_producto TO authenticated;
CREATE UNIQUE INDEX productos_kiosco_barcode_unique_idx
  ON public.productos(kiosco_id,lower(btrim(codigo_barras)))
  WHERE codigo_barras IS NOT NULL AND btrim(codigo_barras)<>'';

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

CREATE OR REPLACE FUNCTION public.crear_ticket_soporte_transaccional(
  p_operacion_id uuid,p_tipo text,p_modulo text,p_mensaje text,p_datos_diagnostico jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE u public.usuarios%ROWTYPE; k public.kioscos%ROWTYPE; op public.operaciones_escritura%ROWTYPE; req jsonb; t public.tickets_soporte%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticación requerida' USING ERRCODE='42501'; END IF;
  SELECT * INTO u FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo LIMIT 1;
  IF NOT FOUND OR u.rol NOT IN ('DUEÑO','CAJERO','VISOR') THEN RAISE EXCEPTION 'Perfil activo no habilitado para soporte' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_tipo NOT IN ('ERROR','CONSULTA','SUGERENCIA','FACTURACION','URGENTE')
    OR length(btrim(coalesce(p_modulo,''))) NOT BETWEEN 1 AND 100
    OR length(btrim(coalesce(p_mensaje,''))) NOT BETWEEN 1 AND 8000
    OR coalesce(jsonb_typeof(p_datos_diagnostico),'object')<>'object'
    OR octet_length(coalesce(p_datos_diagnostico,'{}'::jsonb)::text)>16384 THEN
    RAISE EXCEPTION 'Datos del ticket inválidos' USING ERRCODE='22023';
  END IF;
  SELECT * INTO k FROM public.kioscos WHERE id=u.kiosco_id;
  req:=jsonb_build_object('tipo',p_tipo,'modulo',btrim(p_modulo),'mensaje',btrim(p_mensaje),'diagnostico',coalesce(p_datos_diagnostico,'{}'::jsonb));
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,u.kiosco_id,u.id,'SOPORTE_TICKET',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>u.kiosco_id OR op.usuario_id<>u.id OR op.tipo<>'SOPORTE_TICKET' OR op.solicitud<>req THEN RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023'; END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  INSERT INTO public.tickets_soporte(id,kiosco_id,kiosco_nombre,usuario_id,usuario_nombre,usuario_email,usuario_rol,tipo,modulo,mensaje,datos_diagnostico)
    VALUES(p_operacion_id,u.kiosco_id,k.nombre,u.id,u.nombre,u.email,u.rol,p_tipo,btrim(p_modulo),btrim(p_mensaje),coalesce(p_datos_diagnostico,'{}'::jsonb)) RETURNING * INTO t;
  UPDATE public.operaciones_escritura SET resultado=to_jsonb(t) WHERE id=p_operacion_id;
  RETURN to_jsonb(t);
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_precios_catalogo_transaccional(
  p_operacion_id uuid,p_items jsonb,p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; op public.operaciones_escritura%ROWTYPE; req jsonb; item jsonb; resultado jsonb; filas jsonb:='[]'::jsonb; idx integer:=0;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF a.rol<>'DUEÑO' AND NOT a.es_superadmin THEN RAISE EXCEPTION 'Sólo el dueño puede cambiar precios' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR jsonb_typeof(p_items)<>'array'
     OR (jsonb_array_length(p_items)>100 OR (jsonb_array_length(p_items)=0 AND coalesce(cardinality(p_desactivar_ids),0)=0))
     OR length(coalesce(p_motivo,''))>300 THEN RAISE EXCEPTION 'Lote de precios inválido' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item)<>'object' OR item-'id'-'precio_venta'-'precio_costo'<>'{}'::jsonb OR item->>'id' IS NULL
      OR NOT (item ? 'precio_venta' OR item ? 'precio_costo') THEN RAISE EXCEPTION 'Fila de precio inválida en índice %',idx USING ERRCODE='22023'; END IF;
    IF item ? 'precio_venta' AND ((item->>'precio_venta')::numeric<0 OR (item->>'precio_venta')::numeric<>round((item->>'precio_venta')::numeric,2)) THEN RAISE EXCEPTION 'Precio de venta inválido en índice %',idx USING ERRCODE='22023'; END IF;
    IF item ? 'precio_costo' AND ((item->>'precio_costo')::numeric<0 OR (item->>'precio_costo')::numeric<>round((item->>'precio_costo')::numeric,2)) THEN RAISE EXCEPTION 'Costo inválido en índice %',idx USING ERRCODE='22023'; END IF;
    idx:=idx+1;
  END LOOP;
  req:=jsonb_build_object('items',p_items,'motivo',p_motivo);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud) VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'CATALOGO_PRECIOS',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'CATALOGO_PRECIOS' OR op.solicitud<>req THEN RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023'; END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  idx:=0;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id=(item->>'id')::uuid AND kiosco_id=a.kiosco_id FOR UPDATE) THEN RAISE EXCEPTION 'Producto fuera del comercio autorizado' USING ERRCODE='42501'; END IF;
    resultado:=public.guardar_producto_transaccional(md5(p_operacion_id::text||':'||idx::text)::uuid,(item->>'id')::uuid,
      (item-'id') || CASE WHEN nullif(btrim(coalesce(p_motivo,'')),'') IS NOT NULL THEN jsonb_build_object('motivo_cambio_precio',p_motivo) ELSE '{}'::jsonb END);
    filas:=filas||jsonb_build_array(resultado->'producto');
    idx:=idx+1;
  END LOOP;
  resultado:=jsonb_build_object('actualizados',filas);
  UPDATE public.operaciones_escritura SET resultado=resultado WHERE id=p_operacion_id;
  RETURN resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_categoria_transaccional(
  p_operacion_id uuid,p_categoria_id uuid,p_datos jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; op public.operaciones_escritura%ROWTYPE; req jsonb; c public.categorias%ROWTYPE;
  v_nombre text; v_color text; v_orden integer;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF a.rol<>'DUEÑO' AND NOT a.es_superadmin THEN RAISE EXCEPTION 'Sólo el dueño puede administrar categorías' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_categoria_id IS NULL OR jsonb_typeof(p_datos)<>'object'
     OR p_datos-ARRAY['nombre','color','orden']<>'{}'::jsonb THEN RAISE EXCEPTION 'Datos de categoría inválidos' USING ERRCODE='22023'; END IF;
  v_nombre:=btrim(coalesce(p_datos->>'nombre','')); v_color:=coalesce(p_datos->>'color','#6366f1'); v_orden:=coalesce((p_datos->>'orden')::integer,0);
  IF length(v_nombre) NOT BETWEEN 1 AND 80 OR v_color !~ '^#[0-9A-Fa-f]{6}$' OR v_orden<0 THEN RAISE EXCEPTION 'Datos de categoría inválidos' USING ERRCODE='22023'; END IF;
  req:=jsonb_build_object('categoria',p_categoria_id,'datos',p_datos);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud) VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'CATALOGO_CATEGORIA',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'CATALOGO_CATEGORIA' OR op.solicitud<>req THEN RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023'; END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  SELECT * INTO c FROM public.categorias WHERE id=p_categoria_id AND kiosco_id=a.kiosco_id FOR UPDATE;
  IF FOUND THEN UPDATE public.categorias SET nombre=v_nombre,color=v_color,orden=v_orden WHERE id=c.id RETURNING * INTO c;
  ELSE INSERT INTO public.categorias(id,kiosco_id,nombre,color,orden) VALUES(p_categoria_id,a.kiosco_id,v_nombre,v_color,v_orden) RETURNING * INTO c; END IF;
  UPDATE public.operaciones_escritura SET resultado=to_jsonb(c) WHERE id=p_operacion_id;
  RETURN to_jsonb(c);
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_categoria_transaccional(
  p_operacion_id uuid,p_categoria_id uuid,p_eliminar_productos boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; op public.operaciones_escritura%ROWTYPE; req jsonb; c public.categorias%ROWTYPE; afectados uuid[];
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF a.rol<>'DUEÑO' AND NOT a.es_superadmin THEN RAISE EXCEPTION 'Sólo el dueño puede eliminar categorías' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_categoria_id IS NULL THEN RAISE EXCEPTION 'Identidad de categoría inválida' USING ERRCODE='22023'; END IF;
  req:=jsonb_build_object('categoria',p_categoria_id,'eliminar_productos',coalesce(p_eliminar_productos,false));
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud) VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'CATALOGO_CATEGORIA_DELETE',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'CATALOGO_CATEGORIA_DELETE' OR op.solicitud<>req THEN RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023'; END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  SELECT * INTO c FROM public.categorias WHERE id=p_categoria_id AND kiosco_id=a.kiosco_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Categoría no disponible para este comercio' USING ERRCODE='42501'; END IF;
  SELECT array_agg(id ORDER BY id) INTO afectados FROM public.productos WHERE kiosco_id=a.kiosco_id AND categoria_id=c.id FOR UPDATE;
  IF coalesce(p_eliminar_productos,false) THEN
    IF afectados IS NOT NULL THEN
      DELETE FROM public.combo_items WHERE kiosco_id=a.kiosco_id AND (combo_producto_id=ANY(afectados) OR componente_producto_id=ANY(afectados));
      UPDATE public.productos SET activo=false,categoria_id=NULL,fecha_actualizacion=now() WHERE id=ANY(afectados) AND kiosco_id=a.kiosco_id;
    END IF;
  ELSE
    UPDATE public.productos SET categoria_id=NULL,fecha_actualizacion=now() WHERE kiosco_id=a.kiosco_id AND categoria_id=c.id;
  END IF;
  DELETE FROM public.categorias WHERE id=c.id AND kiosco_id=a.kiosco_id;
  UPDATE public.operaciones_escritura SET resultado=jsonb_build_object('categoria_id',c.id,'productos_afectados',cardinality(coalesce(afectados,'{}'::uuid[]))) WHERE id=p_operacion_id;
  RETURN (SELECT resultado FROM public.operaciones_escritura WHERE id=p_operacion_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_combo_transaccional(
  p_operacion_id uuid,p_producto_id uuid,p_es_combo boolean,p_componentes jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; op public.operaciones_escritura%ROWTYPE; req jsonb; salida jsonb;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF a.rol<>'DUEÑO' AND NOT a.es_superadmin THEN RAISE EXCEPTION 'Sólo el dueño puede cambiar componentes de combos' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_producto_id IS NULL OR jsonb_typeof(p_componentes)<>'array' THEN RAISE EXCEPTION 'Datos de combo inválidos' USING ERRCODE='22023'; END IF;
  req:=jsonb_build_object('producto',p_producto_id,'es_combo',p_es_combo,'componentes',p_componentes);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud) VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'CATALOGO_COMBO',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'CATALOGO_COMBO' OR op.solicitud<>req THEN RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023'; END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  salida:=public.restaurar_combo_backup(a.kiosco_id,p_producto_id,p_es_combo,p_componentes);
  UPDATE public.operaciones_escritura SET resultado=salida WHERE id=p_operacion_id;
  RETURN salida;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_promocion_transaccional(
  p_operacion_id uuid,p_promocion_id uuid,p_datos jsonb,p_eliminar boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; op public.operaciones_escritura%ROWTYPE; req jsonb; p public.promociones%ROWTYPE; modo text; v_nombre text; existe boolean;
  permitidas text[]:=ARRAY['nombre','tipo','producto_id','categoria_id','cantidad_minima','cantidad_paga','precio_unitario_promo',
    'descuento_porcentaje','precio_combo','items_combo','dias_semana','fecha_inicio','fecha_fin','activo'];
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF a.rol<>'DUEÑO' AND NOT a.es_superadmin THEN RAISE EXCEPTION 'Sólo el dueño puede administrar promociones' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_promocion_id IS NULL OR jsonb_typeof(p_datos)<>'object' OR p_datos-permitidas<>'{}'::jsonb THEN RAISE EXCEPTION 'Datos de promoción inválidos' USING ERRCODE='22023'; END IF;
  modo:=CASE WHEN p_eliminar THEN 'ELIMINAR' ELSE 'GUARDAR' END;
  req:=jsonb_build_object('promocion',p_promocion_id,'modo',modo,'datos',p_datos);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud) VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'CATALOGO_PROMOCION',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'CATALOGO_PROMOCION' OR op.solicitud<>req THEN RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023'; END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  SELECT * INTO p FROM public.promociones WHERE id=p_promocion_id AND kiosco_id=a.kiosco_id FOR UPDATE;
  existe:=FOUND;
  IF p_eliminar THEN
    IF NOT existe THEN RAISE EXCEPTION 'Promoción no disponible para este comercio' USING ERRCODE='42501'; END IF;
    DELETE FROM public.promociones WHERE id=p_promocion_id AND kiosco_id=a.kiosco_id;
    UPDATE public.operaciones_escritura SET resultado=jsonb_build_object('id',p_promocion_id,'eliminada',true) WHERE id=p_operacion_id;
    RETURN (SELECT resultado FROM public.operaciones_escritura WHERE id=p_operacion_id);
  END IF;
  v_nombre:=btrim(coalesce(p_datos->>'nombre',p.nombre,''));
  IF length(v_nombre) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Nombre de promoción inválido' USING ERRCODE='22023'; END IF;
  IF coalesce(p_datos->>'tipo',p.tipo) NOT IN ('NXM','VOLUMEN','PORCENTAJE','COMBO') THEN RAISE EXCEPTION 'Tipo de promoción inválido' USING ERRCODE='22023'; END IF;
  IF p_datos ? 'producto_id' AND p_datos->>'producto_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.productos WHERE id=(p_datos->>'producto_id')::uuid AND kiosco_id=a.kiosco_id) THEN RAISE EXCEPTION 'Producto fuera del comercio autorizado' USING ERRCODE='42501'; END IF;
  IF p_datos ? 'categoria_id' AND p_datos->>'categoria_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.categorias WHERE id=(p_datos->>'categoria_id')::uuid AND kiosco_id=a.kiosco_id) THEN RAISE EXCEPTION 'Categoría fuera del comercio autorizado' USING ERRCODE='42501'; END IF;
  IF p_datos ? 'cantidad_minima' AND ((p_datos->>'cantidad_minima')::numeric<=0 OR (p_datos->>'cantidad_minima')::numeric>999999 OR (p_datos->>'cantidad_minima')::numeric<>round((p_datos->>'cantidad_minima')::numeric,3)) THEN RAISE EXCEPTION 'Cantidad mínima inválida' USING ERRCODE='22023'; END IF;
  IF (p_datos ? 'cantidad_paga' AND (p_datos->>'cantidad_paga')::numeric<0)
    OR (p_datos ? 'precio_unitario_promo' AND ((p_datos->>'precio_unitario_promo')::numeric<0 OR (p_datos->>'precio_unitario_promo')::numeric<>round((p_datos->>'precio_unitario_promo')::numeric,2)))
    OR (p_datos ? 'precio_combo' AND ((p_datos->>'precio_combo')::numeric<0 OR (p_datos->>'precio_combo')::numeric<>round((p_datos->>'precio_combo')::numeric,2))) THEN RAISE EXCEPTION 'Importe o cantidad promocional inválidos' USING ERRCODE='22023'; END IF;
  IF p_datos ? 'descuento_porcentaje' AND (p_datos->>'descuento_porcentaje')::numeric NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Descuento inválido' USING ERRCODE='22023'; END IF;
  IF p_datos ? 'items_combo' AND jsonb_typeof(p_datos->'items_combo') NOT IN ('array','null') THEN RAISE EXCEPTION 'Composición promocional inválida' USING ERRCODE='22023'; END IF;
  IF p_datos ? 'dias_semana' AND jsonb_typeof(p_datos->'dias_semana') NOT IN ('array','null') THEN RAISE EXCEPTION 'Días de promoción inválidos' USING ERRCODE='22023'; END IF;
  IF p_datos->'dias_semana' IS NOT NULL AND p_datos->'dias_semana'<>'null'::jsonb AND EXISTS(
    SELECT 1 FROM jsonb_array_elements_text(p_datos->'dias_semana') d WHERE d::integer NOT BETWEEN 0 AND 6
  ) THEN RAISE EXCEPTION 'Día de la semana inválido' USING ERRCODE='22023'; END IF;
  IF NOT existe THEN
    INSERT INTO public.promociones(id,kiosco_id,nombre,tipo,producto_id,categoria_id,cantidad_minima,cantidad_paga,precio_unitario_promo,
      descuento_porcentaje,precio_combo,items_combo,dias_semana,fecha_inicio,fecha_fin,activo)
    VALUES(p_promocion_id,a.kiosco_id,v_nombre,p_datos->>'tipo',NULLIF(p_datos->>'producto_id','')::uuid,NULLIF(p_datos->>'categoria_id','')::uuid,
      coalesce((p_datos->>'cantidad_minima')::numeric,1),(p_datos->>'cantidad_paga')::numeric,(p_datos->>'precio_unitario_promo')::numeric,
      (p_datos->>'descuento_porcentaje')::numeric,(p_datos->>'precio_combo')::numeric,NULLIF(p_datos->'items_combo','null'::jsonb),
      CASE WHEN p_datos->'dias_semana' IS NULL OR p_datos->'dias_semana'='null'::jsonb THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(p_datos->'dias_semana')::integer) END,
      (p_datos->>'fecha_inicio')::timestamptz,(p_datos->>'fecha_fin')::timestamptz,coalesce((p_datos->>'activo')::boolean,true)) RETURNING * INTO p;
  ELSE
    UPDATE public.promociones SET nombre=v_nombre,tipo=coalesce(p_datos->>'tipo',p.tipo),
      producto_id=CASE WHEN p_datos ? 'producto_id' THEN NULLIF(p_datos->>'producto_id','')::uuid ELSE p.producto_id END,
      categoria_id=CASE WHEN p_datos ? 'categoria_id' THEN NULLIF(p_datos->>'categoria_id','')::uuid ELSE p.categoria_id END,
      cantidad_minima=coalesce((p_datos->>'cantidad_minima')::numeric,p.cantidad_minima),
      cantidad_paga=CASE WHEN p_datos ? 'cantidad_paga' THEN (p_datos->>'cantidad_paga')::numeric ELSE p.cantidad_paga END,
      precio_unitario_promo=CASE WHEN p_datos ? 'precio_unitario_promo' THEN (p_datos->>'precio_unitario_promo')::numeric ELSE p.precio_unitario_promo END,
      descuento_porcentaje=CASE WHEN p_datos ? 'descuento_porcentaje' THEN (p_datos->>'descuento_porcentaje')::numeric ELSE p.descuento_porcentaje END,
      precio_combo=CASE WHEN p_datos ? 'precio_combo' THEN (p_datos->>'precio_combo')::numeric ELSE p.precio_combo END,
      items_combo=CASE WHEN p_datos ? 'items_combo' THEN NULLIF(p_datos->'items_combo','null'::jsonb) ELSE p.items_combo END,
      dias_semana=CASE WHEN p_datos ? 'dias_semana' THEN CASE WHEN p_datos->'dias_semana'='null'::jsonb THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(p_datos->'dias_semana')::integer) END ELSE p.dias_semana END,
      fecha_inicio=CASE WHEN p_datos ? 'fecha_inicio' THEN (p_datos->>'fecha_inicio')::timestamptz ELSE p.fecha_inicio END,
      fecha_fin=CASE WHEN p_datos ? 'fecha_fin' THEN (p_datos->>'fecha_fin')::timestamptz ELSE p.fecha_fin END,
      activo=coalesce((p_datos->>'activo')::boolean,p.activo)
      WHERE id=p.id AND kiosco_id=a.kiosco_id RETURNING * INTO p;
  END IF;
  UPDATE public.operaciones_escritura SET resultado=to_jsonb(p) WHERE id=p_operacion_id;
  RETURN to_jsonb(p);
END;
$$;

CREATE OR REPLACE FUNCTION public.importar_productos_catalogo_transaccional(
  p_operacion_id uuid,p_items jsonb,p_desactivar_ids uuid[] DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; op public.operaciones_escritura%ROWTYPE; req jsonb; item jsonb; datos jsonb; producto_id uuid;
  idx integer:=0; filas jsonb:='[]'::jsonb; errores jsonb:='[]'::jsonb; salida jsonb; error_actual text;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF a.rol<>'DUEÑO' AND NOT a.es_superadmin THEN RAISE EXCEPTION 'Sólo el dueño puede importar productos' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100
     OR coalesce(cardinality(p_desactivar_ids),0)>100 THEN RAISE EXCEPTION 'Chunk de importación inválido (máximo 100 filas)' USING ERRCODE='22023'; END IF;
  req:=jsonb_build_object('items',p_items,'desactivar',coalesce(p_desactivar_ids,'{}'::uuid[]));
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud) VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'CATALOGO_IMPORTACION',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'CATALOGO_IMPORTACION' OR op.solicitud<>req THEN RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023'; END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  IF EXISTS(SELECT 1 FROM public.productos p WHERE p.id=ANY(coalesce(p_desactivar_ids,'{}'::uuid[])) AND p.kiosco_id<>a.kiosco_id)
    OR EXISTS(SELECT 1 FROM unnest(coalesce(p_desactivar_ids,'{}'::uuid[])) x(id) WHERE NOT EXISTS(SELECT 1 FROM public.productos p WHERE p.id=x.id AND p.kiosco_id=a.kiosco_id)) THEN
    RAISE EXCEPTION 'Un producto del lote no pertenece al comercio autorizado' USING ERRCODE='42501';
  END IF;
  BEGIN
    FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
      idx:=idx+1;
      IF jsonb_typeof(item)<>'object' OR item-'id'-'datos'<>'{}'::jsonb OR item->>'id' IS NULL OR jsonb_typeof(item->'datos')<>'object' THEN
        RAISE EXCEPTION 'Fila de importación inválida';
      END IF;
      producto_id:=(item->>'id')::uuid; datos:=item->'datos';
      salida:=public.guardar_producto_transaccional(md5(p_operacion_id::text||':row:'||idx::text)::uuid,producto_id,datos);
      filas:=filas||jsonb_build_array((salida->'producto')||jsonb_build_object('precio_costo',salida->'precio_costo'));
    END LOOP;
    FOREACH producto_id IN ARRAY coalesce(p_desactivar_ids,'{}'::uuid[]) LOOP
      idx:=idx+1;
      salida:=public.guardar_producto_transaccional(md5(p_operacion_id::text||':deactivate:'||producto_id::text)::uuid,producto_id,'{"activo":false,"categoria_id":null}'::jsonb);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    error_actual:=SQLERRM;
    filas:='[]'::jsonb;
    errores:=jsonb_build_array(jsonb_build_object('fila',idx,'error',error_actual));
  END;
  salida:=CASE WHEN jsonb_array_length(errores)>0 THEN jsonb_build_object('ok',false,'errores',errores,'productos',filas)
    ELSE jsonb_build_object('ok',true,'errores',errores,'productos',filas,'desactivados',cardinality(coalesce(p_desactivar_ids,'{}'::uuid[]))) END;
  UPDATE public.operaciones_escritura SET resultado=salida WHERE id=p_operacion_id;
  RETURN salida;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_producto_transaccional(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crear_ticket_soporte_transaccional(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.actualizar_precios_catalogo_transaccional(uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guardar_categoria_transaccional(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.eliminar_categoria_transaccional(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guardar_combo_transaccional(uuid,uuid,boolean,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guardar_promocion_transaccional(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.importar_productos_catalogo_transaccional(uuid,jsonb,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.guardar_producto_transaccional(uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_ticket_soporte_transaccional(uuid,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_precios_catalogo_transaccional(uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_categoria_transaccional(uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_categoria_transaccional(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_combo_transaccional(uuid,uuid,boolean,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_promocion_transaccional(uuid,uuid,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importar_productos_catalogo_transaccional(uuid,jsonb,uuid[]) TO authenticated;
COMMIT;
