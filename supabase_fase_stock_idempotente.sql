-- Aplicar después de supabase_fase_mermas_trazables.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.operaciones_stock (
  id uuid PRIMARY KEY,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  solicitud jsonb NOT NULL,
  resultado jsonb,
  fecha timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.operaciones_stock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operaciones_stock FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_movimiento_stock_idempotente(
  p_operacion_id uuid, p_producto_id uuid, p_tipo text, p_cantidad numeric, p_motivo text,
  p_notas text DEFAULT NULL, p_fecha_vencimiento date DEFAULT NULL,
  p_numero_lote text DEFAULT NULL, p_lote_id uuid DEFAULT NULL
)
RETURNS TABLE(stock_anterior numeric, stock_nuevo numeric, movimiento_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_kiosco uuid;
  v_solicitud jsonb;
  v_operacion public.operaciones_stock%ROWTYPE;
  v_resultado jsonb;
BEGIN
  IF p_operacion_id IS NULL THEN
    RAISE EXCEPTION 'Falta el identificador de operación' USING ERRCODE='22023';
  END IF;
  SELECT kiosco_id INTO v_kiosco FROM public.productos WHERE id=p_producto_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado' USING ERRCODE='P0002'; END IF;
  IF NOT COALESCE(auth.role()='service_role',false) AND NOT public.auth_es_superadmin()
    AND v_kiosco IS DISTINCT FROM public.auth_user_kiosco_id() THEN
    RAISE EXCEPTION 'No autorizado para modificar el stock de este comercio' USING ERRCODE='42501';
  END IF;
  v_solicitud := jsonb_build_object('producto',p_producto_id,'tipo',p_tipo,'cantidad',p_cantidad,
    'motivo',p_motivo,'notas',p_notas,'vencimiento',p_fecha_vencimiento,'numero_lote',p_numero_lote,'lote',p_lote_id);
  -- La clave única serializa reintentos concurrentes, incluso para productos distintos.
  INSERT INTO public.operaciones_stock(id,kiosco_id,solicitud)
    VALUES(p_operacion_id,v_kiosco,v_solicitud) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO v_operacion FROM public.operaciones_stock WHERE id=p_operacion_id FOR UPDATE;
  IF v_operacion.resultado @> '{"cancelada":true}'::jsonb THEN
    RAISE EXCEPTION 'La operación fue cancelada; no se modificó stock' USING ERRCODE='22023';
  END IF;
  IF v_operacion.kiosco_id IS DISTINCT FROM v_kiosco OR v_operacion.solicitud IS DISTINCT FROM v_solicitud THEN
    RAISE EXCEPTION 'El identificador ya corresponde a otra operación' USING ERRCODE='22023';
  END IF;
  IF v_operacion.resultado IS NULL THEN
    SELECT to_jsonb(m) INTO v_resultado FROM public.registrar_movimiento_stock(
      p_producto_id,p_tipo,p_cantidad,p_motivo,p_notas,p_fecha_vencimiento,p_numero_lote,p_lote_id) AS m;
    UPDATE public.operaciones_stock SET resultado=v_resultado WHERE id=p_operacion_id;
  ELSE
    v_resultado := v_operacion.resultado;
  END IF;
  RETURN QUERY SELECT (v_resultado->>'stock_anterior')::numeric,
    (v_resultado->>'stock_nuevo')::numeric,(v_resultado->>'movimiento_id')::uuid;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_movimiento_stock_idempotente(uuid,uuid,text,numeric,text,text,date,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_stock_idempotente(uuid,uuid,text,numeric,text,text,date,text,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.resolver_operacion_stock(
  p_operacion_id uuid, p_kiosco_id uuid, p_producto_id uuid, p_cancelar boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_operacion public.operaciones_stock%ROWTYPE;
BEGIN
  IF p_operacion_id IS NULL OR p_kiosco_id IS NULL OR p_producto_id IS NULL THEN
    RAISE EXCEPTION 'Falta la identidad de la operación' USING ERRCODE='22023';
  END IF;
  IF NOT COALESCE(auth.role()='service_role',false) AND NOT public.auth_es_superadmin()
    AND p_kiosco_id IS DISTINCT FROM public.auth_user_kiosco_id() THEN
    RAISE EXCEPTION 'No autorizado para consultar esta operación' USING ERRCODE='42501';
  END IF;
  IF p_cancelar THEN
    -- Si una solicitud está en curso, el conflicto espera su transacción.
    -- Si no existe, reserva una cancelación que rechaza llegadas demoradas.
    INSERT INTO public.operaciones_stock(id,kiosco_id,solicitud,resultado)
      VALUES(p_operacion_id,p_kiosco_id,jsonb_build_object('producto',p_producto_id),'{"cancelada":true}')
      ON CONFLICT(id) DO NOTHING;
  END IF;
  SELECT * INTO v_operacion FROM public.operaciones_stock WHERE id=p_operacion_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('estado','NO_REGISTRADA'); END IF;
  IF v_operacion.kiosco_id IS DISTINCT FROM p_kiosco_id OR
    v_operacion.solicitud->>'producto' IS DISTINCT FROM p_producto_id::text THEN
    RAISE EXCEPTION 'No autorizado para consultar esta operación' USING ERRCODE='42501';
  END IF;
  IF v_operacion.resultado @> '{"cancelada":true}'::jsonb THEN
    RETURN jsonb_build_object('estado','CANCELADA');
  END IF;
  RETURN jsonb_build_object('estado','APLICADA','resultado',v_operacion.resultado);
END;
$$;
REVOKE ALL ON FUNCTION public.resolver_operacion_stock(uuid,uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolver_operacion_stock(uuid,uuid,uuid,boolean) TO authenticated,service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
