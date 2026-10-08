# Anulación de venta atómica — fase 51

## Aplicación

Ejecutar `supabase_fase_anulacion_venta_atomica.sql` completo en el SQL Editor del
proyecto Supabase, después de las migraciones de checkout manual, auditoría de
anulaciones, costos privados de movimientos y devoluciones. Desplegar el frontend que utiliza
`anular_venta_atomica`. Sin esta función la pantalla rechaza la operación;
no utiliza escrituras parciales como alternativa.

## Garantías y alcance

- El servidor exige un único perfil de dueño activo y el comercio activo.
- Bloquea la venta y su cierre histórico. Restituye los componentes guardados al
  vender y los lotes originales, aunque la receta actual del combo sea distinta.
- Stock, lotes, cuenta corriente, caja, estado y auditoría se confirman juntos.
  Un error revierte toda la operación. Reintentar la misma venta devuelve la
  primera confirmación sin repetir reintegros.
- Cada ingreso por restitución conserva el costo privado congelado de su
  salida original, aunque el costo del producto haya cambiado. Si falta ese
  registro histórico se revierte toda la anulación y se exige conciliación.
  Los costos no se incluyen en la respuesta de la RPC.
- En caja original abierta, excluir la venta anulada del arqueo ya descuenta su
  efectivo; no agrega un segundo egreso. Si está cerrada, el dueño debe elegir
  la caja actual abierta mediante la casilla del diálogo.
- Las ventas fiscales con CAE requieren el circuito de nota de crédito. Las
  ventas con devoluciones previas y las ventas sin cierre transaccional
  verificable requieren conciliación y se rechazan.
- La anulación contable no devuelve dinero automáticamente en tarjetas,
  transferencias ni Mercado Pago. El reintegro externo debe realizarse y
  verificarse por su medio original.
- Se invalida la caché para obtener stock vigente al volver al catálogo: un
  reintento devuelve la primera confirmación y podría ser anterior a otras
  ventas. Los errores de recarga local se informan después de la confirmación.

## Evidencia y pendientes

Las pruebas PGlite ejecutan la migración real dos veces, verifican recetas
históricas, restitución de lotes, pagos mixtos, auditoría, reintentos,
autorización, caja cerrada y rollback ante errores u omisiones de triggers.
Las pruebas del cliente verifican una única RPC, rechazos y respuestas inválidas.
La integración ejecuta el cierre real y luego anula/reintenta: verifica saldo,
stock, lotes FEFO originales, una sola auditoría y costo histórico después de
cambiar el costo vigente. Si ya se ejecutó la fase 51, volver a ejecutar su
archivo actualizado para incorporar esta conservación de costo.
Falta aplicar la migración en el proyecto remoto y comprobar una operación de
prueba autorizada allí. Las ventas antiguas sin snapshot permanecen pendientes
de un procedimiento de conciliación; esta fase no acredita su recuperación.

## Autoevaluación

Se aplicó la skill agent-self-evaluation: precisión 4 (pruebas locales reales,
sin ejecución remota); completitud 3 (conciliación legacy y prueba remota
pendientes); claridad 4 (reglas de caja explícitas); acción 4 (SQL y contrato
listos); concisión 4 (una RPC reemplaza las escrituras parciales).
