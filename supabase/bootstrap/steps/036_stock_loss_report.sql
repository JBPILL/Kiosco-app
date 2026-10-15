-- Aplicar después de costos históricos privados. Reporte de gestión, no asiento fiscal.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_movimientos_stock_bajas_periodo
  ON public.movimientos_stock(kiosco_id,fecha) WHERE tipo='EGRESO';

CREATE OR REPLACE FUNCTION public.resumir_bajas_stock(
  p_kiosco_id uuid, p_desde date, p_hasta date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(
    public.auth_es_superadmin() OR
    (p_kiosco_id=public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin()),false
  ) OR p_kiosco_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado para consultar bajas de este comercio' USING ERRCODE='42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR NOT isfinite(p_desde) OR NOT isfinite(p_hasta)
    OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'Rango de fechas inválido' USING ERRCODE='22023';
  END IF;

  WITH bajas AS (
    SELECT m.motivo,
      CASE WHEN m.cantidad='NaN'::numeric THEN NULL ELSE m.cantidad END AS cantidad,
      CASE WHEN c.precio_costo='NaN'::numeric THEN NULL ELSE c.precio_costo END AS precio_costo
    FROM public.movimientos_stock m
    LEFT JOIN public.movimiento_stock_costos c
      ON c.movimiento_id=m.id AND c.kiosco_id=m.kiosco_id
    WHERE m.kiosco_id=p_kiosco_id AND m.tipo='EGRESO'
      AND m.motivo IN('MERMA','PERDIDA','ROTURA','VENCIMIENTO','ROBO','CONSUMO_INTERNO')
      AND m.fecha >= (p_desde::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
      AND m.fecha < ((p_hasta+1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
  ), grupos AS (
    SELECT motivo,count(*) AS movimientos,
      count(*) FILTER(WHERE precio_costo IS NULL OR precio_costo < 0 OR cantidad IS NULL) AS sin_costo,
      sum(abs(cantidad)*precio_costo) FILTER(WHERE precio_costo >= 0 AND cantidad IS NOT NULL) AS estimacion
    FROM bajas GROUP BY motivo
  )
  SELECT jsonb_build_object(
    'movimientos',COALESCE(sum(movimientos),0),
    'por_motivo',COALESCE(jsonb_agg(jsonb_build_object(
      'motivo',motivo,'movimientos',movimientos,'sin_costo',sin_costo,'estimacion',estimacion
    ) ORDER BY motivo),'[]'::jsonb)
  ) INTO v_resultado FROM grupos;
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.resumir_bajas_stock(uuid,date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.resumir_bajas_stock(uuid,date,date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
