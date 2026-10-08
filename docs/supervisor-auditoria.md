# Auditoría del supervisor

Aplicar el paso 35: `supabase_fase_supervisor_auditoria_consulta.sql`, después de
PIN privado, intentos y autorización de descuento. Está en el ZIP adicional
`artifacts/sql-supervisor-adicionales-2026-10-07.zip`, junto con el paso 34.
La función obtiene la identidad de auth.uid(), exige dueño activo y limita la
consulta a su comercio. No da acceso directo a tablas privadas ni acepta un
comercio o actor suministrado desde el navegador.

Seguridad y Caja muestra los últimos 50 eventos: configuración de PIN, intentos
y estado de permisos. No expone hash, pepper, PIN, token de permiso ni cuerpo
comercial. El actor se identifica por una abreviatura de su identidad de sesión.
El estado de permiso representa su estado actual; no sustituye auditoría fiscal.
El paso 38, después del 36, añade cambios de política comercial a la misma RPC:
porcentaje anterior/nuevo, actor, revisión y fecha. Conserva los siete campos
públicos y el límite por comercio; no permite consultar directamente su tabla.
La UI acepta únicamente detalles de política numéricos entre 0 y 100.

La interfaz vincula los resultados al operador, identidad Auth, comercio, rol y
estado activo: no muestra eventos de un contexto anterior durante el cambio de
sesión. Los dueños inactivos no ven la tarjeta ni generan consultas.

Quince pruebas locales de auditoría verifican aislamiento comercial, roles, límites, columnas
públicas, reejecución SQL, errores de interfaz, consulta de 50 eventos, descarte
de respuestas tardías de otro comercio y rechazo de campos privados inesperados.
Incluyen eventos de política propios, comercio ajeno excluido, valores legibles y
rechazo de detalle arbitrario. Junto con política SQL: 26 pruebas enfocadas aprobadas.
La compilación pasó después de estos cambios. Falta
validación remota con JWT/PostgREST y prueba visual en navegador. La retención y
exportación de auditoría quedan pendientes; esta migración no elimina eventos.

Autoevaluación: exactitud 4 (pruebas SQL y UI; falta remoto), completitud 3
(consulta implementada; falta retención y otras acciones), claridad 4 (límites
documentados), utilidad 4 (tarjeta integrada; requiere SQL), concisión 4
(lista limitada sin datos sensibles). Promedio 3,8/5.
