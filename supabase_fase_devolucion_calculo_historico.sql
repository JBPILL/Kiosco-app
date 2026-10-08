-- Base de cálculo privada. No habilita todavía el circuito de devolución parcial.
BEGIN;
CREATE OR REPLACE FUNCTION public.calcular_reintegro_detalle_historico(
  p_cantidad_original numeric,p_importe_original numeric,p_cantidad_previa numeric,p_cantidad_nueva numeric
) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_cantidad_original IS NULL OR p_importe_original IS NULL OR p_cantidad_previa IS NULL OR p_cantidad_nueva IS NULL
    OR p_cantidad_original::text IN ('NaN','Infinity','-Infinity')
    OR p_importe_original::text IN ('NaN','Infinity','-Infinity')
    OR p_cantidad_previa::text IN ('NaN','Infinity','-Infinity')
    OR p_cantidad_nueva::text IN ('NaN','Infinity','-Infinity')
    OR p_cantidad_original<=0 OR p_importe_original<0 OR p_cantidad_previa<0 OR p_cantidad_nueva<=0
    OR p_cantidad_previa+p_cantidad_nueva>p_cantidad_original
    OR round(p_cantidad_original,3)<>p_cantidad_original
    OR round(p_cantidad_previa,3)<>p_cantidad_previa
    OR round(p_cantidad_nueva,3)<>p_cantidad_nueva
    OR round(p_importe_original,2)<>p_importe_original THEN
    RAISE EXCEPTION 'Cantidad o importe histórico de devolución inválido';
  END IF;
  RETURN round(p_importe_original*(p_cantidad_previa+p_cantidad_nueva)/p_cantidad_original,2)
    -round(p_importe_original*p_cantidad_previa/p_cantidad_original,2);
END $$;
REVOKE ALL ON FUNCTION public.calcular_reintegro_detalle_historico(numeric,numeric,numeric,numeric)
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
