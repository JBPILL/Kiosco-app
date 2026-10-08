# Reposición duplicada tras anular una venta

## Evidencia del 08/10/2026

La captura del usuario muestra dos INGRESOS de una unidad de Quilmes por la
anulación `ef754442-ec79-480c-844e-4091d1ff71ea`: uno con “Anulación atómica…”
y otro con “Devolución por anulación de venta…”. No demuestra por sí sola
que la cantidad de `productos.stock_actual` también haya aumentado dos veces.

La ruta actual de Reportes llama una sola RPC `anular_venta_atomica`. Stock
carga las filas de `movimientos_stock` sin generar una restitución sintética.
La segunda leyenda no se encontró en el código SQL/TypeScript local revisado;
un trigger remoto antiguo es una hipótesis pendiente de comprobar.

### Causa confirmada por diagnóstico remoto

El usuario compartió el catálogo: `trg_devolver_stock_anulacion` está habilitado
y llama a `public.fn_devolver_stock_anulacion`. Esa función suma las cantidades
de `detalles_venta` a `productos.stock_actual` e inserta otro INGRESO cuando la
venta pasa de COMPLETADA a ANULADA. La RPC ya realiza ambas operaciones.
El resultado atómico de la Quilmes conserva stock 17; el producto aparece con
18 y dos ingresos de una unidad a la misma hora. La causa dejó de ser hipotética.

La fase de anulación actualizada retira ese trigger conocido en la misma
transacción que instala la RPC, conservando los triggers de protección/auditoría
y la función antigua. Si el nombre apunta a otra función, aborta sin retirarlo.

`sql_conciliar_anulacion_ef754442.sql` prepara una reparación específica y
auditada de esta unidad extra. Exige retirar el trigger antes, stock 18 y resultado
17, IDs/cantidades/fecha/notas del duplicado conocidos y ausencia de movimientos
posteriores, simultáneos ajenos o sin fecha. Si cualquier condición cambió, aborta.
Conserva los dos ingresos originales y agrega un EGRESO compensatorio de una
unidad con costo histórico. Una auditoría identifica la conciliación y evita
repetirla. Registra contexto SQL Editor sin inventar la identidad de un cajero.
No cambia venta, pagos ni la auditoría original de anulación. Ocho pruebas
PostgreSQL cubren compensación, reintento, condiciones cambiadas y rollback de
auditoría. Aplicación remota y comprobación final todavía pendientes.

## Diagnóstico remoto, sólo lectura

Ejecutar `sql_diagnosticar_stock_anulacion_duplicado.sql` en Supabase SQL Editor
y conservar `diagnostico_stock_anulacion`. Contiene la venta, su confirmación
atómica, movimientos relacionados y definiciones de triggers de `ventas`.
No borra movimientos ni cambia cantidades. Revisar la función que produce
la segunda restitución antes de proponer su retirada o una conciliación.

No eliminar automáticamente una fila ni descontar stock: el duplicado podría
ser sólo del kardex, o también de la cantidad, y pueden existir ventas posteriores.
La corrección histórica requiere identificar efectos reales y preservar auditoría.

## Protección local implementada

La RPC verifica stock y número de ingresos relacionados otra vez después de
actualizar el estado de la venta. Si un trigger añade una restitución, falla y
revierte la transacción completa en vez de confirmar un resultado duplicado.
Dos pruebas reprodujeron primero el fallo, con y sin incremento adicional de
stock, y pasaron tras añadir el control. No elimina el trigger antiguo ni corrige
el movimiento ya guardado. Debe identificarse y resolver su coexistencia remota.

El control cubre efectos inmediatos del UPDATE y notas ligadas al UUID de venta;
no acredita ausencia de procesos externos posteriores o triggers diferidos.
