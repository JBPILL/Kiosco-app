-- Strict-pilot transactional writes for purchases, cash and customer credit.
BEGIN;

CREATE TABLE public.operaciones_escritura (
  id uuid PRIMARY KEY,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  tipo text NOT NULL,
  solicitud jsonb NOT NULL,
  resultado jsonb,
  creada_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operaciones_escritura_kiosco_fecha_idx
  ON public.operaciones_escritura(kiosco_id,creada_en DESC);

CREATE TABLE public.movimientos_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  proveedor_id uuid NOT NULL,
  operacion_id uuid NOT NULL REFERENCES public.operaciones_escritura(id),
  tipo text NOT NULL CHECK (tipo IN ('CARGO_COMPRA','PAGO','AJUSTE','ANULACION_COMPRA','ANULACION_PAGO')),
  monto numeric(12,2) NOT NULL CHECK (monto > 0),
  saldo_resultante numeric(12,2) NOT NULL,
  notas text,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (proveedor_id,kiosco_id) REFERENCES public.proveedores(id,kiosco_id)
);
CREATE INDEX movimientos_proveedor_tenant_fecha_idx
  ON public.movimientos_proveedor(kiosco_id,proveedor_id,creado_en DESC);

ALTER TABLE public.operaciones_escritura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_proveedor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operaciones_escritura,public.movimientos_proveedor FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY movimientos_proveedor_read_tenant ON public.movimientos_proveedor
  FOR SELECT TO authenticated USING (kiosco_id=public.auth_user_kiosco_id());

-- One open register per kiosk. Existing sessions are reconciled before bootstrap.
CREATE UNIQUE INDEX sesiones_caja_una_abierta_por_kiosco_idx
  ON public.sesiones_caja(kiosco_id) WHERE estado='ABIERTA';

CREATE OR REPLACE FUNCTION public.actor_operativo_actual()
RETURNS TABLE(usuario_id uuid,kiosco_id uuid,rol text,es_superadmin boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticación requerida' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT u.id,u.kiosco_id,u.rol,u.es_superadmin FROM public.usuarios u
    WHERE u.auth_user_id=auth.uid() AND u.activo
      AND (u.es_superadmin OR u.rol IN ('DUEÑO','CAJERO')) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil activo requerido' USING ERRCODE='42501'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_movimiento_caja_transaccional(
  p_operacion_id uuid,p_sesion_caja_id uuid,p_tipo text,p_motivo text,p_monto numeric,p_descripcion text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; s public.sesiones_caja%ROWTYPE; req jsonb; op public.operaciones_escritura%ROWTYPE; mid uuid;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF p_operacion_id IS NULL OR p_sesion_caja_id IS NULL OR p_tipo IS NULL OR p_tipo NOT IN ('INGRESO','EGRESO')
     OR p_monto IS NULL OR p_monto<=0 OR p_monto<>round(p_monto,2)
     OR length(btrim(coalesce(p_descripcion,''))) NOT BETWEEN 1 AND 500
     OR length(btrim(coalesce(p_motivo,''))) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Movimiento de caja inválido' USING ERRCODE='22023';
  END IF;
  req:=jsonb_build_object('sesion',p_sesion_caja_id,'tipo',p_tipo,'motivo',p_motivo,'monto',p_monto,'descripcion',btrim(p_descripcion));
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'CAJA_MOVIMIENTO',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'CAJA_MOVIMIENTO' OR op.solicitud<>req THEN
    RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023';
  END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  SELECT * INTO s FROM public.sesiones_caja WHERE id=p_sesion_caja_id FOR UPDATE;
  IF NOT FOUND OR s.kiosco_id<>a.kiosco_id OR s.estado<>'ABIERTA' THEN
    RAISE EXCEPTION 'Sesión de caja no disponible para este comercio' USING ERRCODE='42501';
  END IF;
  mid:=p_operacion_id;
  INSERT INTO public.movimientos_caja(id,kiosco_id,sesion_caja_id,usuario_id,tipo,motivo,monto,descripcion)
    VALUES(mid,a.kiosco_id,s.id,a.usuario_id,p_tipo,btrim(p_motivo),p_monto,btrim(p_descripcion));
  UPDATE public.operaciones_escritura SET resultado=jsonb_build_object('id',mid,'sesion_caja_id',s.id) WHERE id=p_operacion_id;
  RETURN (SELECT resultado FROM public.operaciones_escritura WHERE id=p_operacion_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.abrir_sesion_caja_transaccional(p_operacion_id uuid,p_monto_inicial numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; req jsonb; op public.operaciones_escritura%ROWTYPE; sid uuid;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF p_operacion_id IS NULL OR p_monto_inicial IS NULL OR p_monto_inicial<0 OR p_monto_inicial<>round(p_monto_inicial,2) THEN
    RAISE EXCEPTION 'Fondo inicial inválido' USING ERRCODE='22023';
  END IF;
  req:=jsonb_build_object('monto_inicial',p_monto_inicial);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'CAJA_APERTURA',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'CAJA_APERTURA' OR op.solicitud<>req THEN
    RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023';
  END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  sid:=p_operacion_id;
  INSERT INTO public.sesiones_caja(id,kiosco_id,usuario_id,monto_inicial,estado)
    VALUES(sid,a.kiosco_id,a.usuario_id,p_monto_inicial,'ABIERTA');
  UPDATE public.operaciones_escritura SET resultado=jsonb_build_object('id',sid,'kiosco_id',a.kiosco_id,'usuario_id',a.usuario_id,'monto_inicial',p_monto_inicial,'estado','ABIERTA') WHERE id=p_operacion_id;
  RETURN (SELECT resultado FROM public.operaciones_escritura WHERE id=p_operacion_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cerrar_sesion_caja_transaccional(p_operacion_id uuid,p_sesion_caja_id uuid,p_monto_declarado numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; s public.sesiones_caja%ROWTYPE; req jsonb; op public.operaciones_escritura%ROWTYPE; efectivo numeric(12,2); final_sistema numeric(12,2); diff numeric(12,2); salida jsonb;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF p_operacion_id IS NULL OR p_sesion_caja_id IS NULL OR p_monto_declarado IS NULL OR p_monto_declarado<0 OR p_monto_declarado<>round(p_monto_declarado,2) THEN
    RAISE EXCEPTION 'Arqueo inválido' USING ERRCODE='22023';
  END IF;
  req:=jsonb_build_object('sesion',p_sesion_caja_id,'monto_declarado',p_monto_declarado);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'CAJA_CIERRE',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'CAJA_CIERRE' OR op.solicitud<>req THEN
    RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023';
  END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  SELECT * INTO s FROM public.sesiones_caja WHERE id=p_sesion_caja_id FOR UPDATE;
  IF NOT FOUND OR s.kiosco_id<>a.kiosco_id OR s.estado<>'ABIERTA' THEN
    RAISE EXCEPTION 'Sesión de caja no disponible para este comercio' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(sum(p.monto),0) INTO efectivo FROM public.ventas v JOIN public.pagos_venta p ON p.venta_id=v.id
    WHERE v.sesion_caja_id=s.id AND v.estado='COMPLETADA' AND p.medio_pago='EFECTIVO';
  SELECT round(s.monto_inicial+efectivo+
      coalesce(sum(CASE WHEN m.tipo='INGRESO' THEN m.monto ELSE -m.monto END),0),2)
    INTO final_sistema FROM public.movimientos_caja m WHERE m.sesion_caja_id=s.id;
  final_sistema:=coalesce(final_sistema,s.monto_inicial+efectivo);
  diff:=p_monto_declarado-final_sistema;
  UPDATE public.sesiones_caja SET fecha_cierre=now(),monto_final_declarado=p_monto_declarado,
    monto_final_sistema=final_sistema,diferencia=diff,estado='CERRADA' WHERE id=s.id AND estado='ABIERTA';
  salida:=jsonb_build_object('id',s.id,'fecha_cierre',now(),'monto_final_declarado',p_monto_declarado,
    'monto_final_sistema',final_sistema,'diferencia',diff,'estado','CERRADA');
  UPDATE public.operaciones_escritura SET resultado=salida WHERE id=p_operacion_id;
  RETURN salida;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_proveedor_transaccional(
  p_operacion_id uuid,p_proveedor_id uuid,p_datos jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; req jsonb; op public.operaciones_escritura%ROWTYPE; proveedor public.proveedores%ROWTYPE;
  v_nombre text; salida jsonb;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF NOT a.es_superadmin AND a.rol<>'DUEÑO' THEN RAISE EXCEPTION 'Sólo el dueño puede administrar proveedores' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_proveedor_id IS NULL OR coalesce(jsonb_typeof(p_datos),'')<>'object'
     OR (p_datos - ARRAY['nombre','contacto_nombre','telefono','email','cuit','dias_visita','cbu_alias','activo'])<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Datos de proveedor inválidos' USING ERRCODE='22023';
  END IF;
  v_nombre:=btrim(coalesce(p_datos->>'nombre',''));
  IF length(v_nombre) NOT BETWEEN 1 AND 160 OR length(coalesce(p_datos->>'contacto_nombre',''))>160
    OR length(coalesce(p_datos->>'telefono',''))>80 OR length(coalesce(p_datos->>'email',''))>254
    OR length(coalesce(p_datos->>'cuit',''))>20 OR length(coalesce(p_datos->>'dias_visita',''))>120
    OR length(coalesce(p_datos->>'cbu_alias',''))>120 THEN
    RAISE EXCEPTION 'Campos de proveedor inválidos' USING ERRCODE='22023';
  END IF;
  IF NULLIF(btrim(p_datos->>'email'),'') IS NOT NULL
     AND lower(btrim(p_datos->>'email')) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'El email del proveedor no es válido' USING ERRCODE='22023';
  END IF;
  req:=jsonb_build_object('proveedor',p_proveedor_id,'datos',p_datos);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'PROVEEDOR_GUARDAR',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'PROVEEDOR_GUARDAR' OR op.solicitud<>req THEN
    RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023';
  END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  SELECT * INTO proveedor FROM public.proveedores WHERE id=p_proveedor_id AND kiosco_id=a.kiosco_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.proveedores SET nombre=v_nombre,
      contacto_nombre=NULLIF(btrim(p_datos->>'contacto_nombre'),''),telefono=NULLIF(btrim(p_datos->>'telefono'),''),
      email=NULLIF(lower(btrim(p_datos->>'email')),''),cuit=NULLIF(btrim(p_datos->>'cuit'),''),
      dias_visita=NULLIF(btrim(p_datos->>'dias_visita'),''),cbu_alias=NULLIF(btrim(p_datos->>'cbu_alias'),''),
      activo=coalesce((p_datos->>'activo')::boolean,true)
      WHERE id=p_proveedor_id AND kiosco_id=a.kiosco_id RETURNING * INTO proveedor;
  ELSE
    INSERT INTO public.proveedores(id,kiosco_id,nombre,contacto_nombre,telefono,email,cuit,dias_visita,cbu_alias,activo)
      VALUES(p_proveedor_id,a.kiosco_id,v_nombre,NULLIF(btrim(p_datos->>'contacto_nombre'),''),
        NULLIF(btrim(p_datos->>'telefono'),''),NULLIF(lower(btrim(p_datos->>'email')),''),NULLIF(btrim(p_datos->>'cuit'),''),
        NULLIF(btrim(p_datos->>'dias_visita'),''),NULLIF(btrim(p_datos->>'cbu_alias'),''),coalesce((p_datos->>'activo')::boolean,true))
      RETURNING * INTO proveedor;
  END IF;
  salida:=to_jsonb(proveedor);
  UPDATE public.operaciones_escritura SET resultado=salida WHERE id=p_operacion_id;
  RETURN salida;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_movimiento_cuenta_corriente_transaccional(
  p_operacion_id uuid,p_cliente_id uuid,p_venta_id uuid,p_tipo text,p_monto numeric,p_medio_pago text,p_notas text,
  p_sesion_caja_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; c public.clientes%ROWTYPE; req jsonb; op public.operaciones_escritura%ROWTYPE; nuevo numeric(12,2); mid uuid;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF p_operacion_id IS NULL OR p_cliente_id IS NULL OR p_tipo IS NULL OR p_tipo NOT IN ('CARGO_VENTA','ABONO_PAGO')
     OR p_monto IS NULL OR p_monto<=0 OR p_monto<>round(p_monto,2) THEN
    RAISE EXCEPTION 'Movimiento de cuenta corriente inválido' USING ERRCODE='22023';
  END IF;
  SELECT * INTO c FROM public.clientes WHERE id=p_cliente_id AND kiosco_id=a.kiosco_id AND activo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no disponible para este comercio' USING ERRCODE='42501'; END IF;
  IF p_venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ventas v WHERE v.id=p_venta_id AND v.kiosco_id=a.kiosco_id) THEN
    RAISE EXCEPTION 'La venta no pertenece a este comercio' USING ERRCODE='42501';
  END IF;
  req:=jsonb_build_object('cliente',p_cliente_id,'venta',p_venta_id,'tipo',p_tipo,'monto',p_monto,'medio',p_medio_pago,'notas',p_notas,'sesion',p_sesion_caja_id);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'CUENTA_CORRIENTE',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'CUENTA_CORRIENTE' OR op.solicitud<>req THEN
    RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023';
  END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  IF p_tipo='CARGO_VENTA' AND EXISTS(SELECT 1 FROM public.movimientos_cuenta_corriente WHERE venta_id=p_venta_id AND tipo='CARGO_VENTA') THEN
    RAISE EXCEPTION 'La venta ya generó un cargo de cuenta corriente' USING ERRCODE='23505';
  END IF;
  nuevo:=round(c.saldo_deudor + CASE WHEN p_tipo='CARGO_VENTA' THEN p_monto ELSE -p_monto END,2);
  IF p_tipo='ABONO_PAGO' AND nuevo<0 THEN RAISE EXCEPTION 'El abono supera el saldo deudor registrado' USING ERRCODE='22023'; END IF;
  UPDATE public.clientes SET saldo_deudor=nuevo WHERE id=c.id;
  mid:=p_operacion_id;
  INSERT INTO public.movimientos_cuenta_corriente(id,cliente_id,kiosco_id,venta_id,tipo,monto,medio_pago,saldo_resultante,notas,usuario_id)
    VALUES(mid,c.id,a.kiosco_id,p_venta_id,p_tipo,p_monto,p_medio_pago,nuevo,NULLIF(btrim(p_notas),''),a.usuario_id);
  IF p_sesion_caja_id IS NOT NULL THEN
    IF p_tipo<>'ABONO_PAGO' OR p_medio_pago<>'EFECTIVO' THEN RAISE EXCEPTION 'La caja sólo puede recibir abonos en efectivo' USING ERRCODE='22023'; END IF;
    PERFORM public.registrar_movimiento_caja_transaccional(
      (md5(p_operacion_id::text||':cash')::uuid),p_sesion_caja_id,'INGRESO','COBRO_CUENTA_CORRIENTE',p_monto,'Abono de cuenta corriente');
  END IF;
  UPDATE public.operaciones_escritura SET resultado=jsonb_build_object('movimiento_id',mid,'saldo_deudor',nuevo) WHERE id=p_operacion_id;
  RETURN (SELECT resultado FROM public.operaciones_escritura WHERE id=p_operacion_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_compra_proveedor_transaccional(
  p_operacion_id uuid,p_proveedor_id uuid,p_fecha timestamptz,p_nro_comprobante text,p_medio_pago text,
  p_pagado_en_caja boolean,p_sesion_caja_id uuid,p_notas text,p_total_declarado numeric,p_detalles jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; pr public.proveedores%ROWTYPE; req jsonb; op public.operaciones_escritura%ROWTYPE;
  detalle jsonb; producto public.productos%ROWTYPE; total_calc numeric(12,2):=0; subtotal numeric(12,2);
  compra_id uuid; idx integer:=0; saldo numeric(12,2); pago_id uuid; v_respuesta jsonb; qty numeric(12,3); costo numeric(12,2);
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF NOT a.es_superadmin AND a.rol<>'DUEÑO' THEN RAISE EXCEPTION 'Sólo el dueño puede registrar compras de proveedores' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_proveedor_id IS NULL OR p_fecha IS NULL OR p_medio_pago IS NULL OR p_medio_pago NOT IN ('EFECTIVO','TRANSFERENCIA','CUENTA_CORRIENTE')
     OR p_total_declarado IS NULL OR p_total_declarado<=0 OR p_total_declarado<>round(p_total_declarado,2)
     OR coalesce(jsonb_typeof(p_detalles),'')<>'array' OR jsonb_array_length(p_detalles)>500 THEN
    RAISE EXCEPTION 'Datos de compra inválidos' USING ERRCODE='22023';
  END IF;
  SELECT * INTO pr FROM public.proveedores WHERE id=p_proveedor_id AND kiosco_id=a.kiosco_id AND activo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor no disponible para este comercio' USING ERRCODE='42501'; END IF;
  req:=jsonb_build_object('proveedor',p_proveedor_id,'fecha',p_fecha,'comprobante',p_nro_comprobante,'medio',p_medio_pago,
    'caja',coalesce(p_pagado_en_caja,false),'sesion',p_sesion_caja_id,'notas',p_notas,'total',p_total_declarado,'detalles',p_detalles);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'COMPRA_PROVEEDOR',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'COMPRA_PROVEEDOR' OR op.solicitud<>req THEN
    RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023';
  END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  FOR detalle IN SELECT value FROM jsonb_array_elements(p_detalles) LOOP
    qty:=(detalle->>'cantidad')::numeric; costo:=(detalle->>'precio_costo_unitario')::numeric;
    IF detalle->>'producto_id' IS NULL OR qty<=0 OR qty<>round(qty,3) OR costo<0 OR costo<>round(costo,2) THEN
      RAISE EXCEPTION 'Detalle de compra inválido' USING ERRCODE='22023';
    END IF;
    SELECT * INTO producto FROM public.productos WHERE id=(detalle->>'producto_id')::uuid AND kiosco_id=a.kiosco_id AND activo FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible para este comercio' USING ERRCODE='42501'; END IF;
    total_calc:=total_calc+round(qty*costo,2);
  END LOOP;
  IF jsonb_array_length(p_detalles)>0 AND round(total_calc,2)<>p_total_declarado THEN
    RAISE EXCEPTION 'El total declarado no coincide con las cantidades y costos unitarios' USING ERRCODE='22023';
  END IF;
  IF p_pagado_en_caja AND (p_medio_pago<>'EFECTIVO' OR p_sesion_caja_id IS NULL) THEN
    RAISE EXCEPTION 'La compra sólo puede imputarse a caja con efectivo y sesión identificada' USING ERRCODE='22023';
  END IF;
  compra_id:=p_operacion_id;
  INSERT INTO public.compras_proveedor(id,kiosco_id,proveedor_id,usuario_id,nro_comprobante,fecha,total,estado,medio_pago,pagado_en_caja,sesion_caja_id,notas)
    VALUES(compra_id,a.kiosco_id,pr.id,a.usuario_id,NULLIF(btrim(p_nro_comprobante),''),p_fecha,p_total_declarado,'RECIBIDA',p_medio_pago,
      coalesce(p_pagado_en_caja,false),CASE WHEN p_pagado_en_caja THEN p_sesion_caja_id END,NULLIF(btrim(p_notas),''));
  idx:=0;
  FOR detalle IN SELECT value FROM jsonb_array_elements(p_detalles) LOOP
    idx:=idx+1; qty:=(detalle->>'cantidad')::numeric; costo:=(detalle->>'precio_costo_unitario')::numeric;
    subtotal:=round(qty*costo,2);
    INSERT INTO public.detalles_compra(compra_id,producto_id,cantidad,precio_costo_unitario,subtotal)
      VALUES(compra_id,(detalle->>'producto_id')::uuid,qty,costo,subtotal);
    UPDATE public.producto_costos SET precio_costo=costo,fecha_actualizacion=now() WHERE producto_id=(detalle->>'producto_id')::uuid AND kiosco_id=a.kiosco_id;
    IF NOT FOUND THEN INSERT INTO public.producto_costos(producto_id,kiosco_id,precio_costo) VALUES((detalle->>'producto_id')::uuid,a.kiosco_id,costo); END IF;
    PERFORM public.registrar_movimiento_stock_idempotente(
      (md5(p_operacion_id::text||':stock:'||idx::text)::uuid),(detalle->>'producto_id')::uuid,'INGRESO',qty,'COMPRA',
      'Compra '||coalesce(NULLIF(btrim(p_nro_comprobante),''),'sin comprobante')||' - Proveedor: '||pr.nombre,
      NULLIF(detalle->>'fecha_vencimiento','')::date,NULLIF(detalle->>'numero_lote',''),NULL);
  END LOOP;
  saldo:=pr.saldo_pendiente;
  IF p_medio_pago='CUENTA_CORRIENTE' THEN
    saldo:=round(saldo+p_total_declarado,2);
    UPDATE public.proveedores SET saldo_pendiente=saldo WHERE id=pr.id;
    INSERT INTO public.movimientos_proveedor(kiosco_id,proveedor_id,operacion_id,tipo,monto,saldo_resultante,notas,usuario_id)
      VALUES(a.kiosco_id,pr.id,p_operacion_id,'CARGO_COMPRA',p_total_declarado,saldo,'Compra '||coalesce(p_nro_comprobante,'sin comprobante'),a.usuario_id);
  ELSE
    pago_id:=md5(p_operacion_id::text||':pago')::uuid;
    INSERT INTO public.pagos_proveedor(id,kiosco_id,proveedor_id,fecha,monto,medio_pago,saldo_anterior,saldo_nuevo,pagado_en_caja,sesion_caja_id,comprobante_ref,notas,estado)
      VALUES(pago_id,a.kiosco_id,pr.id,p_fecha,p_total_declarado,p_medio_pago,saldo,saldo,coalesce(p_pagado_en_caja,false),
        CASE WHEN p_pagado_en_caja THEN p_sesion_caja_id END,p_nro_comprobante,'Pago de compra', 'ACTIVO');
  END IF;
  IF coalesce(p_pagado_en_caja,false) THEN
    PERFORM public.registrar_movimiento_caja_transaccional(
      md5(p_operacion_id::text||':cash')::uuid,p_sesion_caja_id,'EGRESO','PROVEEDOR',p_total_declarado,
      'Compra a '||pr.nombre||' (Comprobante: '||coalesce(p_nro_comprobante,'S/N')||')');
  END IF;
  v_respuesta:=jsonb_build_object('compra_id',compra_id,'total',p_total_declarado,'saldo_proveedor',saldo,'estado','RECIBIDA');
  UPDATE public.operaciones_escritura SET resultado=v_respuesta WHERE id=p_operacion_id;
  RETURN v_respuesta;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pago_proveedor_transaccional(
  p_operacion_id uuid,p_proveedor_id uuid,p_monto numeric,p_medio_pago text,p_sesion_caja_id uuid,
  p_comprobante_ref text,p_notas text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; pr public.proveedores%ROWTYPE; req jsonb; op public.operaciones_escritura%ROWTYPE;
  saldo_nuevo numeric(12,2); pago_id uuid; salida jsonb; session_id uuid;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF NOT a.es_superadmin AND a.rol<>'DUEÑO' THEN RAISE EXCEPTION 'Sólo el dueño puede registrar pagos a proveedores' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_proveedor_id IS NULL OR p_monto IS NULL OR p_monto<=0 OR p_monto<>round(p_monto,2)
     OR p_medio_pago IS NULL OR p_medio_pago NOT IN ('EFECTIVO','TRANSFERENCIA','OTRO') THEN
    RAISE EXCEPTION 'Pago a proveedor inválido' USING ERRCODE='22023';
  END IF;
  SELECT * INTO pr FROM public.proveedores WHERE id=p_proveedor_id AND kiosco_id=a.kiosco_id AND activo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor no disponible para este comercio' USING ERRCODE='42501'; END IF;
  session_id:=CASE WHEN p_medio_pago='EFECTIVO' THEN p_sesion_caja_id ELSE NULL END;
  req:=jsonb_build_object('proveedor',p_proveedor_id,'monto',p_monto,'medio',p_medio_pago,'sesion',session_id,'ref',p_comprobante_ref,'notas',p_notas);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'PAGO_PROVEEDOR',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'PAGO_PROVEEDOR' OR op.solicitud<>req THEN
    RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023';
  END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  IF p_monto>pr.saldo_pendiente THEN RAISE EXCEPTION 'El pago supera el saldo pendiente del proveedor' USING ERRCODE='22023'; END IF;
  saldo_nuevo:=round(pr.saldo_pendiente-p_monto,2);
  UPDATE public.proveedores SET saldo_pendiente=saldo_nuevo WHERE id=pr.id;
  pago_id:=p_operacion_id;
  INSERT INTO public.pagos_proveedor(id,kiosco_id,proveedor_id,monto,medio_pago,saldo_anterior,saldo_nuevo,
    pagado_en_caja,sesion_caja_id,comprobante_ref,notas,estado)
  VALUES(pago_id,a.kiosco_id,pr.id,p_monto,p_medio_pago,pr.saldo_pendiente,saldo_nuevo,session_id IS NOT NULL,
    session_id,NULLIF(btrim(p_comprobante_ref),''),NULLIF(btrim(p_notas),''),'ACTIVO');
  INSERT INTO public.movimientos_proveedor(kiosco_id,proveedor_id,operacion_id,tipo,monto,saldo_resultante,notas,usuario_id)
    VALUES(a.kiosco_id,pr.id,p_operacion_id,'PAGO',p_monto,saldo_nuevo,'Pago a proveedor',a.usuario_id);
  IF session_id IS NOT NULL THEN
    PERFORM public.registrar_movimiento_caja_transaccional(md5(p_operacion_id::text||':cash')::uuid,
      session_id,'EGRESO','PROVEEDOR',p_monto,'Pago a proveedor '||pr.nombre||coalesce(' ('||p_comprobante_ref||')',''));
  END IF;
  salida:=jsonb_build_object('pago_id',pago_id,'saldo_anterior',pr.saldo_pendiente,'saldo_nuevo',saldo_nuevo);
  UPDATE public.operaciones_escritura SET resultado=salida WHERE id=p_operacion_id;
  RETURN salida;
END;
$$;

CREATE OR REPLACE FUNCTION public.ajustar_saldo_proveedor_transaccional(
  p_operacion_id uuid,p_proveedor_id uuid,p_nuevo_saldo numeric,p_motivo text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; pr public.proveedores%ROWTYPE; req jsonb; op public.operaciones_escritura%ROWTYPE; delta numeric(12,2); salida jsonb;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF a.rol<>'DUEÑO' AND NOT a.es_superadmin THEN RAISE EXCEPTION 'Sólo el dueño puede ajustar el saldo del proveedor' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_nuevo_saldo IS NULL OR p_nuevo_saldo<0 OR p_nuevo_saldo<>round(p_nuevo_saldo,2)
     OR length(btrim(coalesce(p_motivo,''))) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Ajuste inválido' USING ERRCODE='22023'; END IF;
  SELECT * INTO pr FROM public.proveedores WHERE id=p_proveedor_id AND kiosco_id=a.kiosco_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor no disponible para este comercio' USING ERRCODE='42501'; END IF;
  req:=jsonb_build_object('proveedor',p_proveedor_id,'nuevo_saldo',p_nuevo_saldo,'motivo',btrim(p_motivo));
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'AJUSTE_PROVEEDOR',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'AJUSTE_PROVEEDOR' OR op.solicitud<>req THEN
    RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023';
  END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  delta:=abs(p_nuevo_saldo-pr.saldo_pendiente);
  UPDATE public.proveedores SET saldo_pendiente=p_nuevo_saldo WHERE id=pr.id;
  IF delta>0 THEN
    INSERT INTO public.movimientos_proveedor(kiosco_id,proveedor_id,operacion_id,tipo,monto,saldo_resultante,notas,usuario_id)
      VALUES(a.kiosco_id,pr.id,p_operacion_id,'AJUSTE',delta,p_nuevo_saldo,btrim(p_motivo),a.usuario_id);
  END IF;
  salida:=jsonb_build_object('proveedor_id',pr.id,'saldo_anterior',pr.saldo_pendiente,'saldo_nuevo',p_nuevo_saldo);
  UPDATE public.operaciones_escritura SET resultado=salida WHERE id=p_operacion_id;
  RETURN salida;
END;
$$;

CREATE OR REPLACE FUNCTION public.anular_compra_proveedor_transaccional(p_operacion_id uuid,p_compra_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; c public.compras_proveedor%ROWTYPE; d record; pr public.proveedores%ROWTYPE; req jsonb;
  op public.operaciones_escritura%ROWTYPE; saldo numeric(12,2); idx integer:=0; salida jsonb;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF NOT a.es_superadmin AND a.rol<>'DUEÑO' THEN RAISE EXCEPTION 'Sólo el dueño puede anular compras de proveedores' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_compra_id IS NULL THEN RAISE EXCEPTION 'Identidad de anulación inválida' USING ERRCODE='22023'; END IF;
  SELECT * INTO c FROM public.compras_proveedor WHERE id=p_compra_id AND kiosco_id=a.kiosco_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra no disponible para este comercio' USING ERRCODE='42501'; END IF;
  SELECT * INTO pr FROM public.proveedores WHERE id=c.proveedor_id AND kiosco_id=a.kiosco_id FOR UPDATE;
  req:=jsonb_build_object('compra',p_compra_id);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'ANULACION_COMPRA',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'ANULACION_COMPRA' OR op.solicitud<>req THEN
    RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023';
  END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  IF c.estado='ANULADA' THEN RAISE EXCEPTION 'La compra ya está anulada' USING ERRCODE='22023'; END IF;
  FOR d IN SELECT * FROM public.detalles_compra WHERE compra_id=c.id ORDER BY producto_id,id LOOP
    idx:=idx+1;
    PERFORM public.registrar_movimiento_stock_idempotente(md5(p_operacion_id::text||':stock:'||idx::text)::uuid,
      d.producto_id,'EGRESO',d.cantidad,'ANULACION_COMPRA','Anulación compra '||c.id::text,NULL,NULL,NULL);
  END LOOP;
  IF c.medio_pago='CUENTA_CORRIENTE' THEN
    IF pr.saldo_pendiente<c.total THEN RAISE EXCEPTION 'El saldo del proveedor ya fue aplicado; regularizá antes de anular' USING ERRCODE='22023'; END IF;
    saldo:=round(pr.saldo_pendiente-c.total,2);
    UPDATE public.proveedores SET saldo_pendiente=saldo WHERE id=pr.id;
    INSERT INTO public.movimientos_proveedor(kiosco_id,proveedor_id,operacion_id,tipo,monto,saldo_resultante,notas,usuario_id)
      VALUES(a.kiosco_id,pr.id,p_operacion_id,'ANULACION_COMPRA',c.total,saldo,'Anulación de compra '||c.id::text,a.usuario_id);
  ELSE
    UPDATE public.pagos_proveedor SET estado='ANULADO' WHERE id=md5(c.id::text||':pago')::uuid AND kiosco_id=a.kiosco_id;
    saldo:=pr.saldo_pendiente;
  END IF;
  UPDATE public.compras_proveedor SET estado='ANULADA' WHERE id=c.id AND kiosco_id=a.kiosco_id;
  IF c.pagado_en_caja AND c.sesion_caja_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.sesiones_caja WHERE id=c.sesion_caja_id AND estado='ABIERTA') THEN
    PERFORM public.registrar_movimiento_caja_transaccional(md5(p_operacion_id::text||':cash')::uuid,
      c.sesion_caja_id,'INGRESO','PROVEEDOR',c.total,'Reintegro por anulación de compra '||c.id::text);
  END IF;
  salida:=jsonb_build_object('compra_id',c.id,'estado','ANULADA','saldo_proveedor',saldo);
  UPDATE public.operaciones_escritura SET resultado=salida WHERE id=p_operacion_id;
  RETURN salida;
END;
$$;

CREATE OR REPLACE FUNCTION public.anular_pago_proveedor_transaccional(p_operacion_id uuid,p_pago_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE a record; pago public.pagos_proveedor%ROWTYPE; pr public.proveedores%ROWTYPE; req jsonb;
  op public.operaciones_escritura%ROWTYPE; saldo numeric(12,2); salida jsonb;
BEGIN
  SELECT * INTO a FROM public.actor_operativo_actual();
  IF NOT a.es_superadmin AND a.rol<>'DUEÑO' THEN RAISE EXCEPTION 'Sólo el dueño puede anular pagos de proveedores' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_pago_id IS NULL THEN RAISE EXCEPTION 'Identidad de anulación inválida' USING ERRCODE='22023'; END IF;
  SELECT * INTO pago FROM public.pagos_proveedor WHERE id=p_pago_id AND kiosco_id=a.kiosco_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago no disponible para este comercio' USING ERRCODE='42501'; END IF;
  SELECT * INTO pr FROM public.proveedores WHERE id=pago.proveedor_id AND kiosco_id=a.kiosco_id FOR UPDATE;
  req:=jsonb_build_object('pago',p_pago_id);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,a.kiosco_id,a.usuario_id,'ANULACION_PAGO_PROVEEDOR',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO op FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF op.kiosco_id<>a.kiosco_id OR op.usuario_id<>a.usuario_id OR op.tipo<>'ANULACION_PAGO_PROVEEDOR' OR op.solicitud<>req THEN
    RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023';
  END IF;
  IF op.resultado IS NOT NULL THEN RETURN op.resultado; END IF;
  IF pago.estado='ANULADO' THEN RAISE EXCEPTION 'El pago ya está anulado' USING ERRCODE='22023'; END IF;
  saldo:=round(pr.saldo_pendiente+pago.monto,2);
  UPDATE public.proveedores SET saldo_pendiente=saldo WHERE id=pr.id;
  UPDATE public.pagos_proveedor SET estado='ANULADO' WHERE id=pago.id;
  INSERT INTO public.movimientos_proveedor(kiosco_id,proveedor_id,operacion_id,tipo,monto,saldo_resultante,notas,usuario_id)
    VALUES(a.kiosco_id,pr.id,p_operacion_id,'ANULACION_PAGO',pago.monto,saldo,'Anulación de pago '||pago.id::text,a.usuario_id);
  IF pago.pagado_en_caja AND pago.sesion_caja_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.sesiones_caja WHERE id=pago.sesion_caja_id AND estado='ABIERTA') THEN
    PERFORM public.registrar_movimiento_caja_transaccional(md5(p_operacion_id::text||':cash')::uuid,
      pago.sesion_caja_id,'INGRESO','PROVEEDOR',pago.monto,'Reintegro por anulación de pago '||pago.id::text);
  END IF;
  salida:=jsonb_build_object('pago_id',pago.id,'estado','ANULADO','saldo_proveedor',saldo);
  UPDATE public.operaciones_escritura SET resultado=salida WHERE id=p_operacion_id;
  RETURN salida;
END;
$$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('actor_operativo_actual','registrar_movimiento_caja_transaccional',
      'abrir_sesion_caja_transaccional','cerrar_sesion_caja_transaccional',
      'registrar_movimiento_cuenta_corriente_transaccional','registrar_compra_proveedor_transaccional',
      'registrar_pago_proveedor_transaccional','ajustar_saldo_proveedor_transaccional',
      'anular_compra_proveedor_transaccional','anular_pago_proveedor_transaccional')
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.firma);
    EXECUTE format('ALTER FUNCTION %s SET search_path TO pg_catalog,public',f.firma);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.actor_operativo_actual() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.registrar_movimiento_caja_transaccional(uuid,uuid,text,text,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.abrir_sesion_caja_transaccional(uuid,numeric) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.cerrar_sesion_caja_transaccional(uuid,uuid,numeric) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.registrar_movimiento_cuenta_corriente_transaccional(uuid,uuid,uuid,text,numeric,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.registrar_compra_proveedor_transaccional(uuid,uuid,timestamptz,text,text,boolean,uuid,text,numeric,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.registrar_pago_proveedor_transaccional(uuid,uuid,numeric,text,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.ajustar_saldo_proveedor_transaccional(uuid,uuid,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.anular_compra_proveedor_transaccional(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.anular_pago_proveedor_transaccional(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_caja_transaccional(uuid,uuid,text,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_sesion_caja_transaccional(uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_caja_transaccional(uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_cuenta_corriente_transaccional(uuid,uuid,uuid,text,numeric,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_compra_proveedor_transaccional(uuid,uuid,timestamptz,text,text,boolean,uuid,text,numeric,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_proveedor_transaccional(uuid,uuid,numeric,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_saldo_proveedor_transaccional(uuid,uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_compra_proveedor_transaccional(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_pago_proveedor_transaccional(uuid,uuid) TO authenticated;
COMMIT;
