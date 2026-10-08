# Recuperar un cobro sin copia local

El dueño puede abrir **Caja y Turno → Revisar cobros pendientes del servidor →
Recuperar cobro**. Esta acción obtiene la entrada original de la RPC de
recuperación y muestra el total y medios de pago. Requiere declarar que el
cobro original ya se recibió o que el fiado fue acordado.

**Confirmar cobro original** reenvía esa entrada a `checkout-manual` con el JWT
verificado del dueño. Conserva UUID, vendedor, caja, fecha, descuento y pagos;
el servidor recupera el snapshot congelado y confirma de forma idempotente.
No se invoca un proveedor de pago ni se crea un identificador nuevo.

## Requisitos y errores

- RPC de recuperación y Edge Function `checkout-manual` instaladas, con las
  migraciones de caja compartida, autorización y cancelación vigentes.
- Dueño activo del mismo comercio y suscripción activa. La identidad se
  comprueba antes y después de consultar sesión y después del envío.
- Si hay cancelación local durable, resolverla antes; el formulario no se abre.
  La cancelación remota concurrente se decide en las funciones SQL existentes.
- El fallo deja el formulario abierto: reintentar conserva la misma entrada.
  No cobrar otra vez. Si se recargó la página y ya no aparece el pendiente,
  consultar Reportes para confirmar el estado de la venta.
- No se aplican stock o saldos devueltos, pues pueden ser históricos al
  reintentar. Se invalida la caché de productos y se actualiza la lista remota.
  Consultar la venta/comprobante desde Reportes tras confirmar.
- La recuperación no modifica una caja cerrada ni reemplaza al operador. Si
  las reglas del servidor impiden el cierre, conservar la solicitud y revisar
  el caso; no trasladarla a otra caja o recrear el ticket.

## Evidencia

92 pruebas dirigidas en tres archivos y build aprobados. Incluyen preparación
del cajero, lectura por dueño, cierre privado y reintento en PostgreSQL local;
formulario, rechazo de identidad/rol/token, datos originales, timeout y bloqueo
por cancelación local. Los servicios HTTP del frontend se simulan; falta
aceptación con JWT real, dos equipos y cancelación concurrente en Supabase.
P09 sigue abierto hasta esa comprobación.

Autoevaluación: precisión 4 (SQL real local y aserciones del frontend);
completitud 3 (piloto remoto pendiente); claridad 4 (requisitos y recuperación
ante incertidumbre explícitos); acción 4 (ruta operativa implementada);
concisión 4 (guía concentrada). No se declara cerrado el plan general.
