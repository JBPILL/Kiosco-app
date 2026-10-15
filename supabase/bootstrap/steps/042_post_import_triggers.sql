-- Install hardened operational triggers only after historical rows are loaded.
-- This is part of the canonical bootstrap order, not a trigger bypass.
BEGIN;

CREATE TRIGGER trg_proteger_privilegios_usuario
  BEFORE INSERT OR UPDATE OR DELETE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.proteger_privilegios_usuario();

CREATE TRIGGER trg_proteger_costo_producto
  BEFORE INSERT OR UPDATE OF precio_costo ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_costo_producto();

CREATE TRIGGER trg_normalizar_movimiento_stock
  BEFORE INSERT OR UPDATE ON public.movimientos_stock
  FOR EACH ROW EXECUTE FUNCTION public.normalizar_movimiento_stock();
CREATE TRIGGER trg_capturar_costo_historico_movimiento_stock
  BEFORE INSERT ON public.movimientos_stock
  FOR EACH ROW EXECUTE FUNCTION public.capturar_costo_historico_movimiento_stock();
CREATE TRIGGER trg_inmutar_costo_historico_movimiento_stock
  BEFORE UPDATE OF costo_unitario_referencia ON public.movimientos_stock
  FOR EACH ROW EXECUTE FUNCTION public.capturar_costo_historico_movimiento_stock();
CREATE TRIGGER trg_guardar_costo_privado_movimiento_stock AFTER INSERT ON public.movimientos_stock
  FOR EACH ROW EXECUTE FUNCTION public.guardar_costo_privado_movimiento_stock();

CREATE TRIGGER trg_validar_anulacion_venta
  BEFORE INSERT OR UPDATE ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.auditar_anulacion_venta();
CREATE TRIGGER trg_registrar_auditoria_anulacion_venta
  AFTER UPDATE OF estado ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_anulacion_venta();

CREATE TRIGGER trg_proteger_checkout_manual_cancelado BEFORE INSERT OR UPDATE ON public.checkout_manual_entradas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_checkout_manual_cancelado();
CREATE TRIGGER trg_proteger_checkout_manual_cancelado BEFORE INSERT OR UPDATE ON public.checkout_manuales
  FOR EACH ROW EXECUTE FUNCTION public.proteger_checkout_manual_cancelado();

CREATE TRIGGER proteger_cierre_checkout_manual BEFORE UPDATE OF estado,fecha_cierre,kiosco_id,usuario_id ON public.sesiones_caja
  FOR EACH ROW EXECUTE FUNCTION public.proteger_cierre_caja_checkout_manual();

CREATE TRIGGER trg_proteger_anulacion_atomica BEFORE UPDATE ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_anulacion_atomica();
CREATE TRIGGER trg_lineas_venta_anulada BEFORE INSERT OR UPDATE OR DELETE ON public.detalles_venta
  FOR EACH ROW EXECUTE FUNCTION public.proteger_lineas_venta_anulada();
CREATE TRIGGER trg_pagos_venta_anulada BEFORE INSERT OR UPDATE OR DELETE ON public.pagos_venta
  FOR EACH ROW EXECUTE FUNCTION public.proteger_lineas_venta_anulada();
CREATE TRIGGER trg_devolucion_venta_vigente BEFORE INSERT OR UPDATE ON public.devoluciones_venta
  FOR EACH ROW EXECUTE FUNCTION public.proteger_devolucion_venta_vigente();

NOTIFY pgrst,'reload schema';
COMMIT;
