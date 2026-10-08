# Justificación del cambio de precio — implementación en curso

`supabase_fase_motivo_cambio_precio.sql` es la base de servidor de esta fase.
**No instalar todavía:** los formularios e importadores actuales no envían
`motivo_cambio_precio`. Aplicarla ahora rechazaría sus cambios de precio.
No se incluye en los paquetes SQL destinados al comercio.

La migración conserva la autorización del dueño y la auditoría de actor,
entidad, fecha y valores anterior/nuevo. Exige un motivo de 5 a 300 caracteres
después de recortar espacios. La columna de entrada es transitoria: el trigger
guarda el motivo en auditoría y deja NULL en el producto, de modo que una
operación posterior debe aportar su propia justificación. La restricción de
tabla impide guardar un motivo previo mediante un alta.

El cambio y su auditoría participan en la misma transacción. Un motivo no
otorga permisos al cajero. Enviar el mismo precio no crea otra auditoría.
También se exige motivo a mantenimiento y service_role cuando cambian precios;
las importaciones y restauraciones deberán adaptar su contrato antes de instalar.

## Evidencia y siguientes pasos

`npm run test -- src/lib/securityMigrations.test.ts`: 34 pruebas aprobadas.
Incluye instalación repetida, motivo recortado y descartado, falta de motivo
en un segundo cambio, texto vacío/corto/largo y denegación del cajero.
Son pruebas PostgreSQL local con identidad emulada, sin JWT/PostgREST remoto.

Falta integrar ProductForm, aumentos masivos, importación y restauración;
comprobar rechazo sin actualizar caché; actualizar el paquete y coordinar la
aplicación con el despliegue. No se considera terminada la función completa.

## Autoevaluación

Exactitud 4/5: pruebas SQL locales; falta esquema remoto. Completitud 3/5:
contrato de servidor implementado; faltan todas las rutas de cliente indicadas.
Claridad 4/5: requisito de coordinación explícito; falta guía final de instalación.
Utilidad 4/5: auditoría transaccional probada; aún no utilizable desde interfaz.
Concisión 4/5: reutiliza el trigger existente; queda documentación de transición.
Promedio 3,8/5. Prioridad: integrar las rutas de escritura antes de distribuir SQL.
