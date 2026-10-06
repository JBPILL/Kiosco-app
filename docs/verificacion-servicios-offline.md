# Servicios cobrados sin conexión

La cola conserva la descripción y el precio del concepto libre. Al sincronizar,
crea el producto inactivo antes de la cabecera y los detalles de la venta.
Si falla esa creación, mantiene la venta pendiente para reintentar.

Los conceptos libres no descuentan stock ni lotes al cobrar offline o sincronizar.
Las devoluciones de envases tampoco descuentan mercadería local.
La consulta de stock al sincronizar limita el producto al comercio de la venta
y excluye productos inactivos de colas anteriores.

Verificación: 11 pruebas aprobadas en offlineServicios.test.ts y
comboOffline.test.ts. Las dos nuevas pruebas cubren orden de persistencia,
conservación del concepto en localStorage, ausencia de consultas de stock
y conservación de la venta pendiente ante un error.

Pendiente: comprobar una transacción real con Supabase y pérdida de conexión.
Las ventas antiguas cuya cola no guardó el concepto no pueden recuperar su
descripción desde esta corrección. Los pagos offline siguen requiriendo una
revisión de idempotencia en reintentos parciales.

Autoevaluación: precisión 4/5, completitud 4/5, claridad 5/5,
accionabilidad 4/5 y concisión 5/5. La evidencia automatizada cubre el flujo
del servicio; no acredita todavía la operación real ni la atomicidad completa
de una venta offline.
