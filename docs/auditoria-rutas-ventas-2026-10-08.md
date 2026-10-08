# Inventario de rutas de escritura de ventas

La confirmación remota del ticket EF754442 demuestra un cobro autorizado en
el flujo transaccional. No demuestra que un cajero tenga bloqueadas las rutas
anteriores al llamar directamente a Supabase.

## Evidencia local

`supabase_seguridad_roles_rls.sql` define `ventas_insert_policy` y una política
de detalles que permite todas las operaciones dentro del comercio. Es necesario
comprobar el estado aplicado en la base y las funciones accesibles antes de
restringir esas rutas. El interruptor del frontend no constituye autorización.

## Diagnóstico preparado

Ejecutar `sql_auditar_rutas_escritura_ventas.sql` en SQL Editor. Entrega:

1. Existencia de tablas, RLS y permisos efectivos de INSERT, UPDATE y DELETE
   para anon, authenticated y service_role.
2. Todas las políticas de las tablas objetivo, incluidas condiciones y roles.
3. Firmas completas de funciones de ventas/checkout, permisos de ejecución,
   SECURITY DEFINER y configuración de sesión.

El resultado es una única fila JSON `diagnostico_completo` con las tres secciones,
para evitar que el editor muestre únicamente la última consulta de funciones.
La transacción es de sólo lectura. Los resultados no contienen tickets,
clientes, costos ni credenciales. Si falla, ejecutar ROLLBACK.

Un permiso de tabla no demuestra que una escritura pase RLS. Una función
ejecutable tampoco demuestra que omita controles: se debe inspeccionar su
cuerpo. Las pruebas de aceptación deben utilizar JWT reales de cajero y dueño,
con intentos de escritura y anulación en una base aislada.

## Estado

El usuario compartió el resultado remoto de funciones: anon y authenticated
no pueden preparar ni confirmar el cobro manual. Service_role ejecuta la
preparación de seis argumentos y las confirmaciones públicas del backend;
no ejecuta los helpers internos ni sobrecargas anteriores. Authenticated tiene
acceso a consulta/recuperación/cancelación, cuyos archivos locales exigen dueño
activo y comercio. El cuerpo de esas funciones remotas no se inspeccionó.
Después el usuario compartió el diagnóstico completo: las cinco tablas tienen
RLS habilitado y existen las nueve políticas RESTRICTIVE del paso 47 con dueño
en UPDATE/DELETE. Conviven políticas anteriores PUBLIC y authenticated. Anon
conserva INSERT/UPDATE/DELETE en ventas, detalles y pagos, incluidos permisos
efectivos por columna. Eso no prueba que atraviese RLS, pero es privilegio
innecesario; el paso 48 revoca esas concesiones sin cambiar SELECT.

Service_role no tiene DML directo sobre estas tablas. Las funciones privadas
del cierre escriben como propietario; no conceder DML adicional para corregir
un diagnóstico que ya coincide con el diseño del backend.

El diagnóstico unificado se ejecutó en PostgreSQL/PGlite: entrega una fila con
las tres secciones y reconoce las políticas restrictivas. El inventario de
Supabase fue recibido como resultado pegado por el usuario, sin
una conexión directa inspeccionada por el agente. La consulta no modifica permisos ni ventas. Falta
coordinar la migración del flujo anterior y demostrar rechazo de llamadas
directas sin autorización, preservando recuperación y cobros offline.

## Autoevaluación

| Criterio | Nota | Evidencia |
| --- | --- | --- |
| Exactitud | 4/5 | Nombres contrastados con SQL local; estado remoto desconocido. |
| Completitud | 3/5 | Inventario listo; falta cierre de rutas y prueba JWT real. |
| Claridad | 4/5 | Distingue permisos, políticas y comportamiento de funciones. |
| Acción | 4/5 | Consulta ejecutable; la siguiente migración depende del inventario. |
| Concisión | 4/5 | Tres resultados cubren las rutas principales sin datos de ventas. |
