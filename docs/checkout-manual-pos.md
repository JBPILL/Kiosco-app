# Cobro manual transaccional: conexión del POS

## Alcance

Esta fase conecta el formulario de cobro, su recuperación y la cola local con
`checkout-manual`. El cajero sigue cobrando manualmente en el posnet antes de
registrar el ticket. No hay llamadas a Mercado Pago ni cobros automáticos Point.

La variable `VITE_CHECKOUT_MANUAL_TRANSACCIONAL=true` activa el nuevo circuito.
Sin ella continúa el circuito anterior. Es una puerta de migración, no una
garantía de seguridad para clientes antiguos: retirar sus escrituras directas
requiere una fase posterior de permisos del servidor.

## Activar en ensayo

1. Aplicá completos los pasos 26 y 27, en ese orden:
   `supabase_fase_checkout_manual.sql` y
   `supabase_fase_checkout_manual_backend.sql`. Esta fase del frontend no agrega SQL.
2. Configurá los orígenes y desplegá la función siguiendo
   [la guía del backend](checkout-manual-backend.md). Usá el proyecto de ensayo.
3. Revisá las ventas pendientes de la cola anterior antes de migrar. Se conservan
   y requieren conciliación; no se convierten ni se descuentan automáticamente.
4. En el frontend de ensayo, agregá `VITE_CHECKOUT_MANUAL_TRANSACCIONAL=true`.
   Para Vite local, usá `.env.local` y reiniciá el servidor. En Vercel, agregá la
   variable al entorno del ensayo y generá un nuevo despliegue. La variable es de
   compilación: editarla no cambia un despliegue existente.
5. Confirmá que las variables públicas de Supabase del frontend apuntan al mismo
   proyecto donde aplicaste los SQL y desplegaste la función. Nunca pongas la
   clave `service_role` en una variable `VITE_` ni en el navegador.

Estos pasos remotos no fueron ejecutados desde Codex. La activación en producción
requiere primero superar el piloto de ensayo y completar la conciliación de
conflictos; actualmente no está resuelta como flujo operativo del dueño.

## Comportamiento

- El ticket, sus pagos, fecha y comprobante se guardan en IndexedDB antes de
  enviar. El carrito original queda bloqueado mientras ese cobro está pendiente.
- Reintentar recupera los datos originales, aunque el formulario haya cambiado.
  No genera otro identificador ni vuelve al circuito de escrituras separadas.
- Sin conexión se puede mostrar un comprobante provisional, marcado como
  pendiente. No confirma stock, deuda ni venta en Supabase. El stock visible puede
  quedar desactualizado; varias ventas offline pueden competir por la misma unidad.
- Al reconectar se reintentan las solicitudes del operador original. Un error
  conserva el cobro; no se interpreta como permiso para cobrar nuevamente.
- La confirmación refresca el catálogo actual. No aplica nuevamente los descuentos
  de stock ni utiliza como inventario actual la respuesta de un cierre antiguo.
- El panel de cobros guardados permite recuperar comprobantes tras recargar.
  Mostrar un comprobante desde ese panel no abre automáticamente el cajón.
- La presentación automática se reclama una sola vez entre pestañas. Si el equipo
  se cierra después de reclamarla y antes de mostrar/imprimir, se debe recuperar
  manualmente el ticket desde el historial. No se garantiza impresión física una vez.
- Un comprobante provisional no dispara el cajón ni facturación ARCA automática.
  La factura de un cobro recuperado se emite desde Tickets Emitidos después de
  confirmar. El comprobante local inicial no conserva el resultado fiscal posterior;
  para reimprimir la factura utilizá el historial del servidor.
- El cierre de caja comprueba pendientes de esa caja en este navegador/equipo.
  Otro equipo puede cerrar la misma caja: el servidor rechazará una nueva
  confirmación y será necesaria conciliación. No se implementó un bloqueo global.

## Piloto requerido

Con usuario dueño y cajero del ensayo, verificá una venta normal, pago mixto,
cuenta corriente, combo, lote y devolución de envases; comprobá venta, pagos,
stock y deuda en Supabase. Provocá pérdida de respuesta y reintentá: debe existir
una sola venta con el mismo identificador y un solo cargo de deuda.

Probá sin conexión, recarga y reconexión con el operador original. Cambiar de
operador o comercio no debe mostrar ni confirmar cobros ajenos. La sincronización
no debe imprimir, abrir el cajón ni emitir otra factura. Probá cierre de caja
con un cobro pendiente y recuperación de un cierre confirmado.

Stock/crédito insuficientes, cambios comerciales, caja cerrada y descuentos de
cajero superiores al 15% quedan pendientes de revisión. No borres la solicitud
ni cambies su caja, fecha o ID para forzarla. La base de cancelación auditada del servidor está implementada en el paso 28.
Su conexión con la cola local, la devolución manual del dinero y la autorización
por PIN continúan pendientes; no borres solicitudes para simular cancelaciones.

Las pruebas locales y la compilación son evidencia de código; no sustituyen
JWT/PostgREST, concurrencia real, impresora y cajón en el comercio.

## Evidencia y evaluación de esta fase

La suite completa aprobó 907 pruebas en 100 archivos. Luego se añadieron casos
de recuperación directa y actualización de IndexedDB: el conjunto enfocado de
flujo y outbox aprobó 24 pruebas. El formulario real de pago aprobó otras dos
pruebas de recuperación con caja cerrada, cambio de medio y error de confirmación.
La compilación TypeScript/Vite aprobó; mantiene el aviso por tamaño de chunks.

| Criterio | Puntaje | Evidencia o mejora pendiente |
| --- | --- | --- |
| Precisión | 4/5 | Pruebas locales aprobadas; falta validar autenticación y efectos en Supabase remoto. |
| Completitud | 3/5 | Conexión, persistencia y recuperación implementadas; faltan conciliación y bloqueo de caja entre equipos para producción. |
| Claridad | 4/5 | Guía distingue activación, comprobante provisional y confirmación; falta completar el piloto con capturas del equipo real. |
| Accionabilidad | 4/5 | SQL previos, comandos y variable documentados; requieren ejecución en el proyecto de ensayo. |
| Concisión | 4/5 | Instrucciones agrupadas; los límites de migración requieren esta explicación adicional. |

Promedio: 3,8/5. Prioridades: conciliación auditada, validación remota y permisos
que retiren el circuito anterior. La entrega es una fase del plan, no su cierre.
Esta evaluación coincide con el alcance solicitado sólo si se mantiene explícito
que la activación en producción todavía no está verificada.


## Paso 28: cancelación auditada en el servidor

Aplicar `supabase_fase_checkout_manual_cancelacion.sql` después de los pasos 26 y 27 en el proyecto de ensayo. Esta migración no activa Point ni agrega un botón al POS todavía.

La función `cancelar_checkout_manual(entrada, motivo, resolucion, referencia)` exige sesión JWT authenticated de un dueño activo del comercio. Toma la identidad desde `auth.uid()`; no recibe un actor confiable desde el navegador. La entrada conserva el UUID y el cuerpo originales. Solo admite NO_COBRADO o REINTEGRADO; el segundo requiere una referencia del reintegro efectuado manualmente. No mueve dinero, stock, deuda ni llama a Mercado Pago.

La cancelación guarda entrada, motivo, resolución, referencia, dueño y fecha. Repetir la misma solicitud devuelve la misma fecha de confirmación; modificarla se rechaza. El registro es privado y los roles de aplicación no pueden modificarlo directamente. Una venta ya registrada debe revisarse en Reportes, aunque esté anulada o provenga del circuito antiguo.

Preparación, confirmación y cancelación comparten un bloqueo transaccional por UUID. Los triggers rechazan reintentos de un ID cancelado incluso si todavía no existía un snapshot. No reemplaza el bloqueo global de cierre de caja, la conciliación de otros equipos ni el retiro de permisos del circuito antiguo.

Validación local: 44 pruebas PostgreSQL PGlite del circuito completo y compilación. La migración se ejecuta dos veces en la prueba para comprobar reaplicación. Pendiente piloto JWT/PostgREST y concurrencia real en Supabase, además de interfaz y persistencia local de la cancelación.

Autoevaluación: exactitud 4/5 (SQL ejecutado y casos negativos; falta concurrencia remota); completitud 3/5 (servidor listo, interfaz y PIN pendientes); claridad 4/5 (contrato y límites explícitos; pendiente guía de interfaz); acción 4/5 (SQL aplicable en ensayo, sin piloto remoto); concisión 4/5 (migración independiente, documentación de fase). Promedio 3,8/5. Próxima mejora: integrar confirmación durable de cancelación en la cola sin liberar carritos antes del acuse del servidor.

## Cola local de cancelación — conexión con el paso 28

La cola guarda motivo, resolución y referencia antes de llamar al RPC. Una cancelación sin respuesta sigue en PENDIENTE y bloquea la confirmación normal, la impresión provisional y el cierre local de caja. No cambia de UUID ni se convierte en venta nueva. Solo un acuse CANCELADO del ID, comercio y resolución originales con fecha válida archiva la solicitud; la auditoría se conserva. Una confirmación de venta que ganó la carrera conserva CONFIRMADO y obliga a revisar Reportes.

El cliente exige dueño activo del mismo comercio y JWT de ese dueño. El servidor continúa siendo la autoridad de permisos. La sincronización reintenta el cuerpo durable de cancelación en lugar de enviarlo al cierre de ventas. No hay botón de cancelación aún: falta formulario de autorización/PIN, recuperación de cobros de otros operadores y piloto remoto. No se habilita Point ni se devuelve dinero automáticamente.

Validación: 82 casos entre cliente, outbox, flujo y SQL (81 en suite conjunta, más el caso nuevo de carrera validado con toda la suite de outbox); compilación correcta. No requiere SQL adicional al paso 28 ya entregado.

Autoevaluación: exactitud 4/5 (pruebas y compilación; falta JWT/concurrencia remota); completitud 3/5 (persistencia y RPC listos, formulario/PIN pendientes); claridad 4/5 (estado documentado, falta interfaz); acción 4/5 (código disponible, sin uso desde botón); concisión 4/5 (reutiliza outbox, archivo creció). Promedio 3,8/5. Siguiente mejora: conectar el formulario y la recuperación del dueño, conservando bloqueo hasta el acuse.
