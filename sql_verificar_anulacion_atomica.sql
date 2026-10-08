-- Sólo lectura. Ejecutar después de aplicar la fase 51 actualizada.
-- Comprueba el catálogo; no reemplaza una prueba funcional con identidad real.
WITH funciones AS (
  SELECT nombre,to_regprocedure(nombre) oid FROM (VALUES
    ('public.anular_venta_atomica(uuid,text,uuid)'),
    ('public.proteger_anulacion_atomica()'),
    ('public.proteger_lineas_venta_anulada()'),
    ('public.proteger_devolucion_venta_vigente()')
  ) f(nombre)
), roles AS (
  SELECT rol FROM (VALUES('anon'),('authenticated'),('service_role')) r(rol)
), triggers_esperados AS (
  SELECT tabla,nombre FROM (VALUES
    ('ventas','trg_proteger_anulacion_atomica'),
    ('ventas','trg_validar_anulacion_venta'),
    ('ventas','trg_registrar_auditoria_anulacion_venta'),
    ('detalles_venta','trg_lineas_venta_anulada'),
    ('pagos_venta','trg_pagos_venta_anulada'),
    ('devoluciones_venta','trg_devolucion_venta_vigente')
  ) t(tabla,nombre)
), operacion AS (
  SELECT pg_get_functiondef(oid) definicion FROM funciones
    WHERE nombre='public.anular_venta_atomica(uuid,text,uuid)' AND oid IS NOT NULL
)
SELECT jsonb_build_object(
  'funciones', (SELECT jsonb_agg(jsonb_build_object(
    'funcion',f.nombre,'existe',f.oid IS NOT NULL,'rol',r.rol,
    'puede_ejecutar',coalesce(has_function_privilege(r.rol,f.oid,'EXECUTE'),false),
    'security_definer',coalesce(p.prosecdef,false),'configuracion',p.proconfig
  ) ORDER BY f.nombre,r.rol) FROM funciones f CROSS JOIN roles r LEFT JOIN pg_proc p ON p.oid=f.oid),
  'registro_privado', (SELECT jsonb_agg(jsonb_build_object(
    'rol',rol,'existe',to_regclass('public.anulaciones_venta_atomicas') IS NOT NULL,
    'puede_insertar',coalesce(has_table_privilege(rol,to_regclass('public.anulaciones_venta_atomicas'),'INSERT'),false),
    'puede_actualizar',coalesce(has_table_privilege(rol,to_regclass('public.anulaciones_venta_atomicas'),'UPDATE'),false),
    'puede_borrar',coalesce(has_table_privilege(rol,to_regclass('public.anulaciones_venta_atomicas'),'DELETE'),false),
    'puede_insertar_columnas',coalesce(has_any_column_privilege(rol,to_regclass('public.anulaciones_venta_atomicas'),'INSERT'),false),
    'puede_actualizar_columnas',coalesce(has_any_column_privilege(rol,to_regclass('public.anulaciones_venta_atomicas'),'UPDATE'),false)
  ) ORDER BY rol) FROM roles),
  'triggers', (SELECT jsonb_agg(jsonb_build_object(
    'tabla',e.tabla,'trigger',e.nombre,'existe',t.oid IS NOT NULL,
    'habilitado',coalesce(t.tgenabled IN('O','A'),false),
    'definicion',CASE WHEN t.oid IS NOT NULL THEN pg_get_triggerdef(t.oid) END
  ) ORDER BY e.tabla,e.nombre) FROM triggers_esperados e LEFT JOIN pg_trigger t
    ON t.tgrelid=to_regclass('public.'||e.tabla) AND t.tgname=e.nombre AND NOT t.tgisinternal),
  'version_actual',jsonb_build_object(
    'conserva_costo_original',coalesce((SELECT definicion LIKE '%SET precio_costo=costo_original%' FROM operacion),false),
    'exige_auditoria',coalesce((SELECT definicion LIKE '%No se confirmó la anulación y su auditoría.%' FROM operacion),false),
    'registro_con_rls',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.anulaciones_venta_atomicas')),false)
  )
) AS diagnostico_anulacion;
