# Auditoría del supervisor

Aplicar el paso 35: `supabase_fase_supervisor_auditoria_consulta.sql`, después de
PIN privado, intentos y autorización de descuento. No está en el ZIP anterior.
La función obtiene la identidad de auth.uid(), exige dueño activo y limita la
consulta a su comercio. No da acceso directo a tablas privadas ni acepta un
comercio o actor suministrado desde el navegador.

Seguridad y Caja muestra los últimos 50 eventos: configuración de PIN, intentos
y estado de permisos. No expone hash, pepper, PIN, token de permiso ni cuerpo
comercial. El actor se identifica por una abreviatura de su identidad de sesión.
El estado de permiso representa su estado actual; no sustituye auditoría fiscal.

Nueve pruebas locales verifican aislamiento comercial, roles, límites, columnas
públicas, reejecución SQL, errores de interfaz y consulta de 50 eventos. Falta
validación remota con JWT/PostgREST y prueba visual en navegador. La retención y
exportación de auditoría quedan pendientes; esta migración no elimina eventos.

Autoevaluación: exactitud 4 (pruebas SQL y UI; falta remoto), completitud 3
(consulta implementada; falta retención y otras acciones), claridad 4 (límites
documentados), utilidad 4 (tarjeta integrada; requiere SQL), concisión 4
(lista limitada sin datos sensibles). Promedio 3,8/5.
