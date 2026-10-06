# Conciliación de ventas offline

## Diagnóstico en Supabase

1. Abrir el proyecto correcto y entrar en SQL Editor.
2. Copiar `supabase_diagnostico_ventas_offline.sql` y ejecutar las consultas.
3. La primera lista ventas completadas cuyo pago total no coincide o que carecen
   de pagos o detalles. La segunda muestra líneas de pago iguales para revisar.
4. Comparar cada resultado con el ticket y con la cola offline de ese puesto.
   Dos líneas iguales pueden ser legítimas: no eliminar por esa señal sola.

Las consultas son de solo lectura. No prueban que el stock, la cuenta corriente
o los lotes hayan quedado correctos. Cero resultados tampoco acredita esos pasos.
No se ejecutaron contra el Supabase remoto desde esta sesión.

## Requisito antes de reintentar stock automáticamente

El código actual lee stock, lo actualiza y crea el movimiento por separado.
Los combos repiten ese patrón por componente y capturan errores como avisos.
Propagar esos errores por sí solo puede descontar nuevamente los componentes
ya aplicados cuando se reintenta la venta.

La próxima operación debe ejecutar en una transacción del servidor:

- Validar usuario autenticado, comercio de la venta y productos del mismo comercio.
- Reservar una identidad estable de venta y verificar la solicitud de reintento.
- Persistir conceptos libres, cabecera, detalles y pagos con identidades estables.
- Descontar productos físicos y componentes, aplicando FEFO una sola vez.
- Registrar movimientos con fecha original y costos históricos privados.
- Imputar cuenta corriente una sola vez por venta.
- Confirmar toda la operación o revertirla; devolver el resultado previo si se reintenta.

La definición requiere inspeccionar el esquema real de lotes, combos y cuenta
corriente antes de escribir una migración compatible. También debe fijarse la
política para stock insuficiente al sincronizar ventas ya cobradas.

## Evidencia y alcance

Los commits locales de servicios y pagos offline compilan y tienen 12 pruebas
en dos archivos. El paso de stock transaccional sigue pendiente. No se presenta
la sincronización completa como verificada en producción.

Autoevaluación: precisión 4/5 y completitud 3/5 por falta del esquema remoto;
claridad, accionabilidad y concisión 4/5. La consulta sirve para detectar
inconsistencias monetarias, no para corregirlas automáticamente.
