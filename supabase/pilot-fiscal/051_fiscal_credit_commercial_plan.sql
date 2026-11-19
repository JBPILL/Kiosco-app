-- Preparación comercial NC bajo locks, sin efectos/permiso fuera de transacción.
-- Requiere001–050 + commercial/001–002 + pilot-operations/001.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.exigir_comercio_operativo(uuid)') IS NULL OR to_regprocedure('public.exigir_capacidad_operativa_piloto(uuid,text)') IS NULL THEN RAISE EXCEPTION 'Faltan gates comerciales del piloto.'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.preparar_aplicacion_comercial_nc_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text,p_caja uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE resolucion jsonb; cuerpo jsonb; comercial jsonb; evidencia jsonb; unidades jsonb;
 vinculo public.fiscal_nc_comercial_homologacion%ROWTYPE; caso public.fiscal_nc_borradores_homologacion%ROWTYPE;
 actor public.usuarios%ROWTYPE; producto public.productos%ROWTYPE; kid uuid;
 linea jsonb; original jsonb; metadata jsonb; componente jsonb; meta_componente jsonb; fisicos jsonb:='[]'; stocks jsonb:='[]'; detalles jsonb:='[]'; r record;
 cantidad numeric; importe numeric; total numeric:=0; cantidad_fisica numeric;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Aplicación NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 IF p_caja IS NULL THEN RAISE EXCEPTION 'Seleccionar caja de reintegro.' USING ERRCODE='22023'; END IF;
 resolucion:=public.cargar_resolucion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF resolucion IS NULL THEN RAISE EXCEPTION 'Resolver CAE NC antes de aplicar.' USING ERRCODE='55000'; END IF;
 PERFORM public.exigir_nc_sin_conflictos_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 -- La autoridad actual no se deriva del marcador histórico.
 resolucion:=public.cargar_resolucion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF resolucion->>'solicitud_sha256' IS DISTINCT FROM cuerpo#>>'{cuerpo,sha256}' THEN RAISE EXCEPTION 'Resolución NC de otro cuerpo.' USING ERRCODE='22023'; END IF;
 BEGIN SELECT * INTO STRICT actor FROM public.usuarios WHERE auth_user_id=p_actor AND activo FOR SHARE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Actor NC no autorizado.' USING ERRCODE='42501'; END;
 SELECT kiosco_id INTO kid FROM public.ventas WHERE id=p_venta;
 IF actor.rol IS DISTINCT FROM 'DUEÑO' OR actor.es_superadmin IS DISTINCT FROM false OR actor.kiosco_id IS DISTINCT FROM kid THEN RAISE EXCEPTION 'Aplicación NC no autorizada.' USING ERRCODE='42501'; END IF;
 PERFORM public.exigir_comercio_operativo(kid);
 PERFORM public.exigir_capacidad_operativa_piloto(kid,'DEVOLUCIONES_EFECTIVO');
 comercial:=public.cargar_fuente_comercial_nc_homologacion(p_actor,p_venta,p_operacion);
 evidencia:=public.cargar_unidades_nc_homologacion(p_actor,p_venta,p_operacion);
 SELECT * INTO vinculo FROM public.fiscal_nc_comercial_homologacion WHERE solicitud_id=p_caso FOR SHARE;
 SELECT * INTO caso FROM public.fiscal_nc_borradores_homologacion WHERE id=p_caso FOR SHARE;
 IF vinculo.solicitud_id IS NULL OR vinculo.actor_auth_id IS DISTINCT FROM p_actor OR vinculo.operacion_origen_id IS DISTINCT FROM p_operacion OR vinculo.propuesta_sha256 IS DISTINCT FROM p_sha
  OR vinculo.fuente IS DISTINCT FROM comercial OR vinculo.fuente_canonico IS DISTINCT FROM public.fiscal_json_canonico_homologacion(comercial)
  OR vinculo.fuente_sha256 IS DISTINCT FROM encode(sha256(convert_to(vinculo.fuente_canonico,'UTF8')),'hex')
  OR evidencia->>'estado' IS DISTINCT FROM 'CAPTURADAS' OR vinculo.unidades_canonico IS DISTINCT FROM evidencia#>>'{unidades,canonico}' OR vinculo.unidades_sha256 IS DISTINCT FROM evidencia#>>'{unidades,sha256}'
  OR caso.actor_auth_id IS DISTINCT FROM p_actor OR caso.operacion_origen_id IS DISTINCT FROM p_operacion OR caso.propuesta_sha256 IS DISTINCT FROM p_sha OR caso.datos IS DISTINCT FROM caso.canonico::jsonb OR encode(sha256(convert_to(caso.canonico,'UTF8')),'hex') IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'Hechos comerciales NC cambiaron.' USING ERRCODE='22023'; END IF;
 IF comercial->'pago_integro_efectivo' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Reintegro efectivo requiere pago original efectivo.' USING ERRCODE='22023'; END IF;
 unidades:=vinculo.unidades_canonico::jsonb;
 PERFORM 1 FROM public.sesiones_caja WHERE id=p_caja AND kiosco_id=kid AND estado='ABIERTA' AND fecha_cierre IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Seleccionar caja abierta del comercio.' USING ERRCODE='55000'; END IF;
 FOR linea IN SELECT value FROM jsonb_array_elements(caso.datos->'lineas') LOOP
  SELECT value INTO original FROM jsonb_array_elements(comercial->'lineas') WHERE value->>'detalle_id'=linea->>'detalle_id';
  SELECT value INTO metadata FROM jsonb_array_elements(unidades->'lineas') WHERE value->>'detalle_id'=linea->>'detalle_id';
  cantidad:=public.fiscal_nc_decimal(linea->'cantidad',3);importe:=public.fiscal_nc_decimal(linea->'importe',2);
  IF original IS NULL OR metadata IS NULL OR cantidad<=0 OR cantidad>(original->>'cantidad')::numeric OR importe>(original->>'subtotal')::numeric OR jsonb_typeof(linea->'reingresa_stock') IS DISTINCT FROM 'boolean'
   OR metadata->>'producto_id' IS DISTINCT FROM original->>'producto_id' OR metadata->>'tipo' IS DISTINCT FROM original->>'tipo' OR jsonb_typeof(metadata->'es_pesable') IS DISTINCT FROM 'boolean'
   OR ((metadata->>'es_pesable')::boolean=false AND cantidad<>trunc(cantidad)) OR (original->>'tipo'='LIBRE' AND (linea->>'reingresa_stock')::boolean) THEN RAISE EXCEPTION 'Línea NC comercial incompatible.' USING ERRCODE='22023'; END IF;
  total:=total+importe;
  detalles:=detalles||jsonb_build_array(jsonb_build_object('detalle_id',original->'detalle_id','producto_id',original->'producto_id','tipo',original->'tipo','cantidad',linea->'cantidad','importe',linea->'importe','reingresa_stock',linea->'reingresa_stock'));
  IF (linea->>'reingresa_stock')::boolean THEN
   FOR componente IN SELECT value FROM jsonb_array_elements(original->'componentes') LOOP
    SELECT value INTO meta_componente FROM jsonb_array_elements(metadata->'componentes') WHERE value->>'producto_id'=componente->>'producto_id';
    cantidad_fisica:=cantidad*(componente->>'cantidad')::numeric;
    IF meta_componente IS NULL OR jsonb_typeof(meta_componente->'es_pesable') IS DISTINCT FROM 'boolean' OR cantidad_fisica<=0 OR cantidad_fisica<>trunc(cantidad_fisica,3)
     OR ((meta_componente->>'es_pesable')::boolean=false AND cantidad_fisica<>trunc(cantidad_fisica)) THEN RAISE EXCEPTION 'Cantidad física NC incompatible.' USING ERRCODE='22023'; END IF;
    fisicos:=fisicos||jsonb_build_array(jsonb_build_object('producto_id',componente->'producto_id','cantidad',cantidad_fisica::numeric(12,3)::text,'es_pesable',meta_componente->'es_pesable','unidad_medida',meta_componente->'unidad_medida'));
   END LOOP;
  END IF;
 END LOOP;
 IF total<=0 OR total IS DISTINCT FROM (((cuerpo#>>'{cuerpo,canonico}')::jsonb#>>'{solicitud,importes,total}')::numeric) THEN RAISE EXCEPTION 'Importe NC comercial distinto.' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT (x->>'producto_id')::uuid id,sum((x->>'cantidad')::numeric) cantidad FROM jsonb_array_elements(fisicos) x GROUP BY 1 ORDER BY 1 LOOP
  SELECT * INTO producto FROM public.productos WHERE id=r.id AND kiosco_id=kid FOR UPDATE;
  IF NOT FOUND OR producto.es_combo OR producto.stock_actual IS NULL OR producto.stock_actual::text IN ('NaN','Infinity','-Infinity') OR producto.stock_actual<>trunc(producto.stock_actual,3) THEN RAISE EXCEPTION 'Stock actual incompatible.' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(fisicos) x WHERE x->>'producto_id'=r.id::text AND ((x->>'es_pesable')::boolean IS DISTINCT FROM producto.es_pesable OR x->>'unidad_medida' IS DISTINCT FROM producto.unidad_medida))
   OR (producto.es_pesable=false AND producto.stock_actual<>trunc(producto.stock_actual)) THEN RAISE EXCEPTION 'Unidad física NC cambió; requiere conciliación.' USING ERRCODE='22023'; END IF;
  stocks:=stocks||jsonb_build_array(jsonb_build_object('producto_id',r.id,'cantidad',r.cantidad::numeric(12,3)::text,'stock_antes',producto.stock_actual::numeric(12,3)::text));
 END LOOP;
 RETURN jsonb_build_object('version',1,'estado','PLAN_NC_SIN_APLICAR','solicitud_id',p_caso,'intento_id',resolucion->'intento_id','solicitud_sha256',resolucion->'solicitud_sha256','venta_id',p_venta,'operacion_origen_id',p_operacion,'kiosco_id',kid,'usuario_id',actor.id,'actor_auth_id',p_actor,'sesion_caja_id',p_caja,'importe',total::numeric(12,2)::text,'motivo',caso.datos->'motivo','detalles',detalles,'fisicos',stocks,'emision_habilitada',false,'reintegro_habilitado',false,'reposicion_habilitada',false);
END $$;
REVOKE ALL ON FUNCTION public.preparar_aplicacion_comercial_nc_homologacion(uuid,uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preparar_aplicacion_comercial_nc_homologacion(uuid,uuid,uuid,uuid,text,uuid) TO service_role;
COMMIT;
