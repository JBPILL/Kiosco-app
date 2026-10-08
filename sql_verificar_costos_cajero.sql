-- Diagnóstico de sólo lectura bajo rol authenticated y claims de un cajero.
-- No imprime costos. ROLLBACK descarta los cambios de contexto de sesión.
-- Si falla una instrucción, ejecutar ROLLBACK antes de continuar.
BEGIN;
DO $$
DECLARE identidad uuid; cantidad integer;
BEGIN
  SELECT count(*), min(auth_user_id::text)::uuid INTO cantidad,identidad
  FROM public.usuarios
  WHERE kiosco_id='614a2e8c-2488-4caa-a95a-22a04db115b8'
    AND rol='CAJERO' AND activo AND auth_user_id IS NOT NULL;
  IF cantidad<>1 THEN
    RAISE EXCEPTION 'Se requiere seleccionar explícitamente un cajero: encontrados %',cantidad;
  END IF;
  PERFORM set_config('request.jwt.claim.sub',identidad::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',identidad,'role','authenticated')::text,true);
END;
$$;
SET LOCAL ROLE authenticated;
SELECT 'costos de productos visibles al cajero' AS comprobacion,
  count(*) AS filas_visibles FROM public.producto_costos
UNION ALL
SELECT 'costos de movimientos visibles al cajero',
  count(*) FROM public.movimiento_stock_costos;
ROLLBACK;
