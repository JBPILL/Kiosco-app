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
