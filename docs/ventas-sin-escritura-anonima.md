# Paso 48: permisos de escritura sin sesión

El diagnóstico remoto compartido por el usuario muestra INSERT, UPDATE y DELETE
efectivos para anon en ventas, detalles_venta y pagos_venta. Las políticas RLS
no son prueba suficiente para declarar que ese acceso es explotable, pero los
clientes sin sesión no necesitan dichos permisos.

Aplicar `supabase_fase_ventas_sin_escritura_anonima.sql` después del paso 47.
Revoca escritura de PUBLIC y anon tanto en tabla como por columna. Conserva
SELECT y las concesiones explícitas de authenticated. No modifica filas ni
habilita acceso adicional al servidor. Si anon hereda escritura de otro rol,
la migración aborta y revierte: revisar membresías antes de continuar.

## Verificación

14 pruebas de políticas/diagnóstico verifican aplicación doble, concesiones
previas por tabla y columna, rechazo de DELETE anónimo y permisos autenticados
conservados. La suite del cierre real también aplica los pasos 47 y 48.
Pasaron 86 pruebas en ambos archivos.
La aceptación remota requiere repetir el diagnóstico: en las tres tablas,
anon debe tener false en las cinco columnas de escritura. Probar cobro y
reimpresión con sesión válida. SELECT con privilegio no garantiza filas visibles;
RLS continúa gobernando esa lectura.

No aplicado remotamente por el agente. Las inserciones de ventas anteriores
para cajeros siguen pendientes de migración al cierre autorizado.

Autoevaluación: exactitud 4/5 (PostgreSQL local, falta API remota), completitud
3/5 (permiso anónimo corregido, legado autenticado pendiente), claridad 4/5
(privilegios y RLS distinguidos), acción 4/5 (migración reaplicable y aceptación
explícita), concisión 4/5 (tres tablas y comprobación de permisos heredados).
