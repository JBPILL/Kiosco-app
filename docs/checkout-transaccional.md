# Checkout manual y offline: siguiente fase

## Evidencia actual

`PaymentModal.tsx` y `offlineSyncStore.ts` escriben cabecera, detalles, pagos,
stock y cuenta corriente en solicitudes separadas. Un fallo puede dejar efectos
parciales; reintentar el mismo ID no demuestra que stock o deuda sean idempotentes.
La confirmación de Point ya hace el cierre en una transacción, pero todavía no
reemplaza esos dos caminos. No habilitar reservas Point en producción hasta
integrarlos.

La primera corrección de esta fase impide anunciar una venta offline guardada si
`localStorage` falla y evita sobrescribir una cola ilegible al encolar. Los fallos
de persistencia liberan el indicador de sincronización y muestran un error. La
cola permanece disponible para recuperación. Esto no vuelve atómico el cierre
remoto ni garantiza concurrencia entre pestañas.

## Contrato que debe cumplir la integración

1. Un RPC autenticado guarda venta, conceptos virtuales, detalles, pagos, consumo
   físico, lotes FEFO, kardex con costos privados y deuda en una transacción.
   Validar comercio, usuario y permiso en servidor; el cliente no elige otra cuenta.
2. El ID de checkout identifica el resultado de forma durable. Repetir exactamente
   la misma solicitud devuelve la misma venta sin repetir movimientos. Reutilizar
   el ID con otro ticket o pago debe rechazarse. No reutilizar ventas anuladas.
3. La deducción considera reservas activas Point, componentes físicos de combos y
   disponibilidad de lotes. Capturar la receta usada para que un cambio posterior
   no altere el consumo de una venta pendiente. Nunca descontar stock virtual.
4. Validar cantidades, importes y suma de líneas/pagos. Conservar descuentos,
   devoluciones de envases y el prorrateo ya usado en el POS. No guardar costos
   privados desde valores elegidos por el navegador.
5. Conservar la caja y fecha originales de ventas offline. Definir explícitamente
   cómo conciliar una venta de una caja ya cerrada y un crédito/stock que perdió
   disponibilidad mientras el equipo estaba desconectado. Un conflicto queda
   pendiente y visible; no se elimina de la cola ni se transforma en otro cobro.
6. Quitar la venta de la cola únicamente cuando el RPC confirma su cierre completo.
   Si se pierde la respuesta, reintentar el mismo checkout y recuperar su resultado.
   Actualizar caches locales a partir de ese resultado, sin aplicar una segunda
   deducción optimista.
7. Probar rollback en cada efecto, respuesta perdida, cancelación posterior,
   dos conexiones sobre el mismo checkout y competencia con una reserva Point.
   Las pruebas embebidas no sustituyen el ensayo de PostgREST/JWT/concurrencia real.

## Evaluación de la corrección inicial

Precisión 4/5: fallos de almacenamiento cubiertos; falta ensayo en equipo real.
Completitud 3/5: durabilidad local mejorada; RPC y conflictos offline pendientes.
Claridad 4/5: alcance y contratos explícitos; falta interfaz de conflictos.
Accionabilidad 4/5: escenarios reproducibles; la migración atómica aún no existe.
Concisión 4/5: requisitos concentrados en este archivo. Promedio 3,8/5.
Prioridad siguiente: implementar el RPC compartido y su recuperación idempotente.
La evaluación distingue esta corrección del objetivo completo del plan.

Validación local: siete pruebas dirigidas aprobadas y compilación TypeScript/Vite
sin errores. No requiere una migración SQL. No se probó agotando el disco de un
equipo real ni se validó todavía la transacción compartida pendiente.
