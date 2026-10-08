# Seguridad y restauración: estado de aceptación

## Evidencia local

El 08/10 se ejecutaron 92 pruebas en seis archivos: securityMigrations (45),
backupRestore, backupAmpliadoIntegracion, backupAmpliadoSql, backupCrypto y
combosSecurityMigration (47 en conjunto). Todas pasaron. Las pruebas SQL usan
PostgreSQL en memoria; varias pruebas de restauración usan respuestas simuladas.
No equivalen a restauración de una copia real ni a llamadas PostgREST con JWT real.

## Seguridad remota

Ejecutar `sql_verificar_costos_cajero.sql` en el proyecto usado por Don Pedro.
Selecciona el único cajero activo de ese comercio; aborta ante ambigüedad.
Aplica rol authenticated y claims transaccionales, sólo cuenta las filas de
costos privados y termina con ROLLBACK. Debe devolver cero en ambas filas.
Si falta privilegio de SELECT, el acceso también está denegado, pero se debe
registrar el error y ejecutar ROLLBACK. No ampliar permisos para que pase.
Esta comprobación no valida firma/expiración de JWT ni la capa HTTP; después
se requiere aceptación con sesión real de cajero y llamadas directas a la API.

## Restauración real pendiente

Exportar una copia cifrada como dueño y conservarla fuera del equipo. No enviar
contraseña ni contenido con datos personales al chat. Registrar versión,
cantidades de las seis colecciones y fecha. Preparar una base de ensayo aislada
con el esquema instalado y un comercio compatible; validar el mecanismo de
identidad antes de importar. No modificar el identificador dentro del JSON ni
restaurar sobre el comercio operativo sólo para probar.

La aceptación necesita exportación, descifrado, importación y comparación de
cantidades, relaciones, saldos, costos privados y configuración; además verificar
que no se copiaron sesiones ni credenciales. La copia operativa no contiene
historial íntegro de ventas/caja. Conservar también una estrategia de respaldo de
PostgreSQL y Storage. Definir retención de copias externas sigue pendiente.

Autoevaluación: precisión 4 (resultados locales medidos); integridad 3 (faltan
JWT real y restauración aislada); claridad 4 (capas de evidencia separadas);
utilidad 4 (consulta ejecutable, ensayo externo pendiente); concisión 4.
Media 3,8. Prioridades: evidencia remota de costos y entorno de restauración.
