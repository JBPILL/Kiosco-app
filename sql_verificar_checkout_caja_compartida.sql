-- Sólo lectura. No ejecuta cobros ni muestra secretos o solicitudes guardadas.
-- Cada fila debe indicar correcto=true. No sustituye una prueba de venta.
WITH funciones(firma,anterior,nuevo) AS (VALUES
  ('public.preparar_checkout_manual(uuid,jsonb,jsonb)',
   'WHERE id=v_caja AND kiosco_id=v_kid AND usuario_id=v_uid AND estado=',
   'WHERE id=v_caja AND kiosco_id=v_kid AND estado='),
  ('public.confirmar_venta_manual_interna_supervisor(uuid,jsonb)',
   'WHERE id=caja_id AND kiosco_id=kid AND usuario_id=uid FOR UPDATE',
   'WHERE id=caja_id AND kiosco_id=kid FOR UPDATE'),
  ('public.cancelar_checkout_manual(jsonb,text,text,text)',
   'WHERE id=v_caja AND kiosco_id=v_kid AND usuario_id=v_uid FOR SHARE',
   'WHERE id=v_caja AND kiosco_id=v_kid FOR SHARE')
), estado AS (
 SELECT firma,anterior,nuevo,to_regprocedure(firma) AS funcion FROM funciones
)
SELECT firma AS comprobacion,
 coalesce(strpos(pg_get_functiondef(funcion),nuevo)>0
   AND strpos(pg_get_functiondef(funcion),anterior)=0,false) AS correcto
FROM estado
UNION ALL
SELECT 'preparador 6 argumentos disponible al servidor',
 coalesce(has_function_privilege('service_role',
   to_regprocedure('public.preparar_checkout_manual(uuid,jsonb,jsonb,boolean,numeric,bigint)'),
   'EXECUTE'),false)
UNION ALL
SELECT 'cierre autorizado disponible al servidor',
 coalesce(has_function_privilege('service_role',
   to_regprocedure('public.confirmar_venta_manual_autorizada(uuid,jsonb,jsonb,uuid)'),
   'EXECUTE'),false)
UNION ALL
SELECT 'cierre interno no ejecutable directamente por cajero',
 coalesce(NOT has_function_privilege('authenticated',
   to_regprocedure('public.confirmar_venta_manual_interna_supervisor(uuid,jsonb)'),
   'EXECUTE'),false);
