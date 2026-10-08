# Consulta de auditoría comercial — SQL 40

Aplicar completo `supabase_fase_auditoria_comercial_consulta.sql` en el proyecto de ensayo después de las migraciones 04 y 05. Es compatible con el motivo específico del SQL 39 y puede reaplicarse. No reemplaza los registros existentes ni activa pagos Point.

El dueño activo encuentra la tarjeta en Configuración → Seguridad y Caja. Consulta los 50 eventos más recientes de cambios de precio y anulaciones del comercio, con motivo, fecha, actor y precios anterior/nuevo cuando corresponde. La consulta admite límites de 1 a 100; sólo authenticated puede invocarla y el servidor exige dueño activo con perfil único. Los campos adicionales del JSON de auditoría no se devuelven.

## Validación remota pendiente

1. Dueño del ensayo: cambiar un precio con motivo y anular una venta de prueba; actualizar la tarjeta y comprobar ambos registros.
2. Cajero: invocar `consultar_auditoria_comercial` con su sesión real; debe rechazarse.
3. Dueño de otro comercio: comprobar que obtiene únicamente sus propios eventos.
4. Cambiar de comercio o cerrar sesión mientras carga: no deben aparecer resultados anteriores.
5. Comparar precio, motivo, actor y fecha con los registros persistidos. No usar service_role como prueba de los permisos de un usuario.

La ausencia de la migración o un fallo de red se presenta como error, no como ausencia de eventos. No incluye todavía exportación ni política de retención.

## Evidencia local y evaluación

48 pruebas aprobadas en los archivos CommercialAuditSection.test.tsx y securityMigrations.test.ts: permisos, límite, reaplicación, aislamiento, campos permitidos, errores, carga accesible, anulaciones históricas y respuestas tardías tras cambios de comercio o rol. No acreditan un piloto real en Supabase.

Evaluación: exactitud 4 (pruebas locales, falta piloto remoto); completitud 3 (consulta implementada, exportación y retención pendientes); claridad 4 (tarjeta compacta, actor mostrado por ID parcial); acción 4 (SQL y pasos de ensayo disponibles, aplicación remota pendiente); concisión 4 (lista limitada, sin filtros). Promedio 3,8. Mejoras prioritarias: piloto con JWT reales, retención y exportación, nombres de actores autorizados. La evaluación refleja los límites visibles para el usuario.
