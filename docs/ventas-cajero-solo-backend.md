# Ventas del cajero por backend — paso 52

El paso 47 conserva INSERT de tickets sin preparación. Esa compatibilidad
permite crear una venta directamente por REST sin pasar por cotización y
autorización de descuento. El paso 52 cierra esa ruta mediante políticas
restrictivas INSERT en ventas, detalles y pagos.

## Orden de despliegue

1. Confirmar el frontend con `VITE_CHECKOUT_MANUAL_TRANSACCIONAL=true` en el
   entorno usado y la Edge Function `checkout-manual` con las migraciones de
   cierre y autorización vigentes.
2. Conservar y conciliar colas del flujo anterior. No recrear tickets cobrados
   ni convertirlos en solicitudes nuevas.
3. Ejecutar `supabase_fase_ventas_cajero_solo_backend.sql` completo.
4. Verificar una venta del cajero por backend, un descuento que requiera PIN y
   su reintento. Comprobar que INSERT directo con identidad de cajero se rechaza.

El dueño/superadmin conserva su autorización existente, sujeta a las demás
políticas y a los triggers de auditoría. Las funciones privadas del servidor
siguen escribiendo como propietario; no se otorgan permisos nuevos a cajeros.
SELECT y las solicitudes pendientes transaccionales permanecen disponibles.

Con el frontend anterior o el indicador desactivado, la escritura del cajero
será rechazada. Por eso la habilitación del backend es requisito previo.
Retirar esta política reabre la brecha; ante un incidente conservar solicitudes
y corregir el despliegue del backend antes de volver a intentar.

## Validación

Después de aplicar el paso 52, ejecutar `sql_verificar_ventas_cajero_solo_backend.sql`
en el SQL Editor. `paso_52_instalado` debe ser `true`: revisa las tres tablas,
RLS habilitado y la política INSERT restrictiva para authenticated con la
condición de dueño/superadmin. Un resultado false identifica la tabla pendiente.
Este diagnóstico de catálogo no comprueba la identidad JWT ni el funcionamiento
de la Edge Function; conservar las comprobaciones operativas del paso 4.

PGlite verifica los tres INSERT directos con políticas permisivas existentes,
su rechazo para cajero y la conservación de permisos del dueño. La integración
del checkout real confirma y reintenta con esta política aplicada. Falta
aplicación y comprobación remota; la fase de seguridad sigue abierta.

El diagnóstico se ejecutó sobre el catálogo PostgreSQL de PGlite: detecta
RLS deshabilitado, política ausente y una condición reemplazada por `true` en
cualquiera de las tres tablas. Las 17 pruebas del archivo de inmutabilidad
pasaron; build aprobado. No se ejecutó esta consulta en Supabase remoto.

Autoevaluación (skill agent-self-evaluation): precisión 4 por evidencia SQL
local; completitud 3 por despliegue remoto pendiente; claridad 4 por orden de
activación explícito; acción 4 por migración ejecutable; concisión 4.
