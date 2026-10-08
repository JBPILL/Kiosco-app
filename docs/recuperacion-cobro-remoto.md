# Recuperar un cobro sin copia local

## Comprobación de instalación del paso 53

Después de aplicar `supabase_fase_checkout_recuperacion_auditada.sql`, ejecutar
`sql_verificar_recuperacion_auditada.sql` en el SQL Editor de Supabase. Es sólo
lectura y devuelve booleanos: tabla, RLS, función, contexto del propietario,
search_path, ausencia de escritura directa (incluidos permisos por columna),
ejecución del servidor, bloqueo del navegador y política de lectura esperada.
Los controles deben ser `true`; un `false` requiere revisar la instalación.

Este diagnóstico no certifica el cuerpo de la función, políticas adicionales,
JWT, despliegue de `checkout-manual` ni una recuperación real. No debe usarse
como aprobación global del paso 53. Se probó localmente con objetos ausentes,
catálogo esperado y concesión indebida por columna: tres pruebas aprobadas.

## Operación

El dueño puede abrir **Caja y Turno → Revisar cobros pendientes del servidor →
Recuperar cobro**. Esta acción obtiene la entrada original de la RPC de
recuperación y muestra el total y medios de pago. Requiere declarar que el
cobro original ya se recibió o que el fiado fue acordado.

**Confirmar cobro original** reenvía esa entrada a `checkout-manual` con el JWT
verificado del dueño. Conserva UUID, vendedor, caja, fecha, descuento y pagos;
el servidor recupera el snapshot congelado y confirma de forma idempotente.
No se invoca un proveedor de pago ni se crea un identificador nuevo.

## Requisitos y errores

### Auditoría del dueño — paso 53

Instalar `supabase_fase_checkout_recuperacion_auditada.sql` completo antes de
desplegar la versión actualizada de la Edge Function `checkout-manual`.
El adaptador utiliza `confirmar_checkout_recuperado` cuando un dueño confirma
la solicitud de otro vendedor. La RPC es privada, ejecutable sólo por servicio,
y valida dueño activo, comercio y snapshot original antes de cerrar.

`checkout_recuperaciones` conserva venta, comercio, identidad autenticada y
perfil del dueño, vendedor original, fecha y si el cierre ya existía antes de
la recuperación. No se atribuye al dueño un cierre previo del cajero. Cada
par venta/dueño se registra una vez; reintentar conserva la primera auditoría.
La tabla sólo permite lectura al dueño/superadmin del comercio, sin escritura
directa de anon, authenticated o service_role. La inserción de auditoría y el
cierre financiero pertenecen a la misma transacción.

Si falta el paso 53, el nuevo backend no confirma recuperaciones de otro
vendedor; conserva la solicitud y comunica incertidumbre. No usar una ruta
sin auditoría como fallback. Las ventas ordinarias del operador original siguen
usando su cierre existente. Si el dueño es el vendedor original, la identidad
ya coincide y se utiliza ese circuito ordinario.

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

Auditoría del paso 53: 113 pruebas dirigidas en dos archivos aprobadas. Cubren
revocación de escritura de tabla/columnas, acceso privado a la RPC, rechazo
de cajero o snapshot alterado, reintento con un único registro y rollback
financiero ante fallo de auditoría. El adaptador real selecciona la RPC auditada
para dueño que recupera a otro operador y conserva la ruta ordinaria para el
vendedor original. SQL y Edge actualizados aún no aplicados remotamente.

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
