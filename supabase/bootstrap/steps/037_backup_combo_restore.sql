-- Fase 49: snapshot con componentes de combos físicos, sin truncamiento.
-- Aplicar después de respaldo integral, ampliado y la tabla combo_items.
-- STABLE conserva el snapshot MVCC de la sentencia que invoca la función.

BEGIN;

CREATE OR REPLACE FUNCTION public.generar_snapshot_backup(p_kiosco_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nombre text;
  v_resultado jsonb;
BEGIN
  IF p_kiosco_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere el comercio del respaldo.' USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE((
    auth.role() = 'service_role'
    OR public.auth_es_superadmin()
    OR (public.auth_es_dueno_o_superadmin() AND p_kiosco_id = public.auth_user_kiosco_id())
  ), false) THEN
    RAISE EXCEPTION 'Solo el dueño del comercio puede generar este respaldo.' USING ERRCODE = '42501';
  END IF;

  SELECT k.nombre INTO v_nombre FROM public.kioscos k WHERE k.id = p_kiosco_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El comercio no existe.' USING ERRCODE = 'P0002';
  END IF;

  WITH productos_backup AS (
    SELECT COALESCE(jsonb_agg(
      to_jsonb(p) || jsonb_build_object('precio_costo', COALESCE(pc.precio_costo, 0),
        'componentes_combo', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'componente_producto_id', ci.componente_producto_id, 'cantidad', ci.cantidad)
          ORDER BY ci.componente_producto_id), '[]'::jsonb)
          FROM public.combo_items ci WHERE ci.combo_producto_id=p.id AND ci.kiosco_id=p_kiosco_id)) ORDER BY p.id
    ), '[]'::jsonb) AS datos
    FROM public.productos p
    LEFT JOIN public.producto_costos pc ON pc.producto_id = p.id AND pc.kiosco_id = p_kiosco_id
    WHERE p.kiosco_id = p_kiosco_id
  ), categorias_backup AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id), '[]'::jsonb) AS datos
    FROM public.categorias c WHERE c.kiosco_id = p_kiosco_id
  ), clientes_backup AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id), '[]'::jsonb) AS datos
    FROM public.clientes c WHERE c.kiosco_id = p_kiosco_id
  ), proveedores_backup AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id), '[]'::jsonb) AS datos
    FROM public.proveedores p WHERE p.kiosco_id = p_kiosco_id
  ), promociones_backup AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id), '[]'::jsonb) AS datos
    FROM public.promociones p WHERE p.kiosco_id = p_kiosco_id
  ), lotes_backup AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb) AS datos
    FROM public.lotes_producto l WHERE l.kiosco_id = p_kiosco_id
  )
  SELECT jsonb_build_object(
    'version', '3.0', 'app', 'KioskoApp', 'exportDate', statement_timestamp(),
    'kiosco', jsonb_build_object('id', p_kiosco_id, 'nombre', v_nombre),
    'estadisticas', jsonb_build_object(
      'totalProductos', jsonb_array_length(p.datos), 'totalCategorias', jsonb_array_length(c.datos),
      'totalClientes', jsonb_array_length(cl.datos), 'totalProveedores', jsonb_array_length(pr.datos),
      'totalPromociones', jsonb_array_length(pm.datos), 'totalLotes', jsonb_array_length(l.datos)
    ),
    'productos', p.datos, 'categorias', c.datos, 'clientes', cl.datos,
    'proveedores', pr.datos, 'promociones', pm.datos, 'lotes_producto', l.datos,
    'contenido', jsonb_build_object(
      'colecciones', jsonb_build_array('productos', 'categorias', 'clientes', 'proveedores', 'promociones', 'lotes_producto'),
      'incluyeVentas', false, 'incluyeMovimientosCaja', false, 'incluyeCredenciales', false
    )
  ) INTO v_resultado
  FROM productos_backup p CROSS JOIN categorias_backup c CROSS JOIN clientes_backup cl
  CROSS JOIN proveedores_backup pr CROSS JOIN promociones_backup pm CROSS JOIN lotes_backup l;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.generar_snapshot_backup(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generar_snapshot_backup(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
