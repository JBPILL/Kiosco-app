-- Final security boundary for the one-shot checkout pilot baseline.
-- Run only after every ordered step in README.md has completed.
BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Bootstrap security finalization must run as postgres; current_user=%', current_user;
  END IF;
END;
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Normalize any policy created by the historical source modules before defining
-- the baseline's narrow read policies. No browser role receives table DML.
DO $$
DECLARE
  tabla text;
  pol record;
  tablas text[] := ARRAY[
    'kioscos','usuarios','platform_initial_admin_bootstrap_state','categorias','productos','combo_items','promociones',
    'lotes_producto','sesiones_caja','movimientos_caja','ventas','detalles_venta',
    'pagos_venta','movimientos_stock','clientes','movimientos_cuenta_corriente',
    'devoluciones_venta','producto_costos','movimiento_stock_costos',
    'auditoria_operaciones','checkout_manuales','checkout_manual_entradas',
    'checkout_manual_cancelaciones','anulaciones_venta_atomicas',
    'supervisor_politicas','supervisor_politica_auditoria',
    'supervisor_pin_secretos','supervisor_pin_config_auditoria',
    'supervisor_pin_limites','supervisor_pin_intentos','supervisor_autorizaciones',
    'proveedores','compras_proveedor','detalles_compra','pagos_proveedor','tickets_soporte',
    'operaciones_stock','electronica_unidades','electronica_reparaciones','electronica_solicitudes',
    'operaciones_escritura','movimientos_proveedor','historial_precios_producto'
  ];
BEGIN
  FOREACH tabla IN ARRAY tablas LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tabla);
    FOR pol IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=tabla
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,tabla);
    END LOOP;
  END LOOP;
END;
$$;

CREATE POLICY kioscos_read_tenant ON public.kioscos FOR SELECT TO authenticated
  USING (id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY usuarios_read_tenant ON public.usuarios FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY categorias_read_tenant ON public.categorias FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY productos_read_tenant ON public.productos FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY combos_read_tenant ON public.combo_items FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY promociones_read_tenant ON public.promociones FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY lotes_read_tenant ON public.lotes_producto FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY sesiones_caja_read_tenant ON public.sesiones_caja FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY movimientos_caja_read_tenant ON public.movimientos_caja FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY ventas_read_tenant ON public.ventas FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY detalles_venta_read_tenant ON public.detalles_venta FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ventas v WHERE v.id=venta_id
    AND (v.kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin())));
CREATE POLICY pagos_venta_read_tenant ON public.pagos_venta FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ventas v WHERE v.id=venta_id
    AND (v.kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin())));
CREATE POLICY movimientos_stock_read_tenant ON public.movimientos_stock FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY clientes_read_tenant ON public.clientes FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY movimientos_cc_read_tenant ON public.movimientos_cuenta_corriente FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY producto_costos_read_owner ON public.producto_costos FOR SELECT TO authenticated
  USING (public.auth_es_superadmin() OR
    (kiosco_id=public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin()));
CREATE POLICY movimiento_stock_costos_read_owner ON public.movimiento_stock_costos FOR SELECT TO authenticated
  USING (public.auth_es_superadmin() OR
    (kiosco_id=public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin()));
CREATE POLICY auditoria_read_owner ON public.auditoria_operaciones FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin());
CREATE POLICY annulments_read_owner ON public.anulaciones_venta_atomicas FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin());
CREATE POLICY proveedores_read_tenant ON public.proveedores FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY compras_read_tenant ON public.compras_proveedor FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY detalles_compra_read_tenant ON public.detalles_compra FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.compras_proveedor c WHERE c.id=compra_id AND c.kiosco_id=public.auth_user_kiosco_id()));
CREATE POLICY pagos_proveedor_read_tenant ON public.pagos_proveedor FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY movimientos_proveedor_read_tenant ON public.movimientos_proveedor FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY historial_precios_producto_read_owner ON public.historial_precios_producto FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin());
CREATE POLICY tickets_soporte_read_tenant ON public.tickets_soporte FOR SELECT TO authenticated
  USING (kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin());
CREATE POLICY electronica_unidades_read ON public.electronica_unidades FOR SELECT TO authenticated
  USING (kiosco_id=public.electronica_kiosco_actual());
CREATE POLICY electronica_reparaciones_read ON public.electronica_reparaciones FOR SELECT TO authenticated
  USING (kiosco_id=public.electronica_kiosco_actual());

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE ALL ON public.platform_initial_admin_bootstrap_state FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.kioscos,public.usuarios,public.categorias,public.productos,
  public.combo_items,public.promociones,public.lotes_producto,public.sesiones_caja,
  public.movimientos_caja,public.ventas,public.detalles_venta,public.pagos_venta,
  public.movimientos_stock,public.clientes,public.movimientos_cuenta_corriente,
  public.producto_costos,public.movimiento_stock_costos,public.auditoria_operaciones,
  public.anulaciones_venta_atomicas,public.proveedores,public.compras_proveedor,
  public.detalles_compra,public.pagos_proveedor,public.movimientos_proveedor,public.tickets_soporte,
  public.electronica_unidades,public.electronica_reparaciones,public.historial_precios_producto TO authenticated;
-- The fresh backend keeps browser DML revoked. Tenant-owned writes go through
-- audited server RPC/Edge entrypoints rather than table grants or RLS alone.

-- Every SECURITY DEFINER routine in the public schema must be owned by postgres
-- and use a fixed catalog-first path. Fully qualify application objects in bodies.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS firma
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.firma);
    EXECUTE format('ALTER FUNCTION %s SET search_path TO pg_catalog,public',f.firma);
  END LOOP;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_kiosco_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_rol() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_es_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_es_dueno_o_superadmin() TO authenticated;

GRANT EXECUTE ON FUNCTION public.preparar_checkout_manual(uuid,jsonb,jsonb,boolean,numeric,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_venta_manual(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_venta_manual_autorizada(uuid,jsonb,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.configurar_hash_pin_supervisor(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.reservar_intento_pin_supervisor(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reservar_intento_pin_supervisor(uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalizar_intento_pin_supervisor(uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.emitir_autorizacion_supervisor(uuid,uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.cancelar_checkout_manual(jsonb,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_checkouts_manuales_pendientes(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recuperar_entrada_checkout_manual(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_cancelacion_checkout_manual(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_venta_atomica(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_stock_idempotente(uuid,uuid,text,numeric,text,text,date,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_operacion_stock(uuid,uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_apertura_manual_cajon(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_resultado_apertura_cajon(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_auditoria_supervisor(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resumir_bajas_stock(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_snapshot_backup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_snapshot_backup_ampliado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_combo_backup(uuid,uuid,boolean,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_configuracion_backup(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.electronica_registrar_unidad(uuid,uuid,text,text,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.electronica_guardar_reparacion(uuid,uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_politica_descuento_supervisor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.configurar_politica_descuento_supervisor(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.electronica_kiosco_actual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_caja_transaccional(uuid,uuid,text,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_sesion_caja_transaccional(uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_caja_transaccional(uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_proveedor_transaccional(uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_cuenta_corriente_transaccional(uuid,uuid,uuid,text,numeric,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_compra_proveedor_transaccional(uuid,uuid,timestamptz,text,text,boolean,uuid,text,numeric,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_proveedor_transaccional(uuid,uuid,numeric,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_saldo_proveedor_transaccional(uuid,uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_compra_proveedor_transaccional(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_pago_proveedor_transaccional(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_producto_transaccional(uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_ticket_soporte_transaccional(uuid,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_precios_catalogo_transaccional(uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_categoria_transaccional(uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_categoria_transaccional(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_combo_transaccional(uuid,uuid,boolean,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_promocion_transaccional(uuid,uuid,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importar_productos_catalogo_transaccional(uuid,jsonb,uuid[]) TO authenticated;

-- Internal checkout helpers, SECURITY DEFINER triggers, and
-- confirmar_venta_manual_interna_supervisor remain uncallable by API roles.
DO $$
BEGIN
  IF has_schema_privilege('anon','public','CREATE')
    OR has_schema_privilege('authenticated','public','CREATE')
    OR has_schema_privilege('service_role','public','CREATE') THEN
    RAISE EXCEPTION 'API role retains CREATE on public';
  END IF;
  IF has_function_privilege('anon','public.confirmar_venta_manual(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.confirmar_venta_manual(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.anular_venta_atomica(uuid,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Checkout/annulment RPC ACL is broader than the baseline contract';
  END IF;
END;
$$;

COMMIT;
