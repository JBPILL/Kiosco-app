# Justificación del cambio de precio — implementación en curso

`supabase_fase_motivo_cambio_precio.sql` es la base de servidor de esta fase.
**No instalar todavía:** falta revisar todas las escrituras secundarias y
comprobar el despliegue coordinado. La función sigue desactivada por defecto.
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

ProductForm y aumentos masivos ya incluyen un campo compacto y validación del
motivo, bajo `VITE_AUDITORIA_MOTIVO_PRECIO=true` (desactivado por defecto).
No activar esa variable todavía. Un fallo de esquema no puede eliminar el
motivo para reintentar; un cambio justificado sin confirmación por red conserva
el precio anterior en UI/caché. El motivo no se copia a la caché de productos.
44 pruebas en cuatro archivos aprobaron esta integración y el SQL.

Importación CSV/Excel y restauración JSON ya solicitan motivo bajo la misma
variable. Restauración valida antes de cualquier escritura y sólo adjunta el
motivo al actualizar productos existentes. Importación no anuncia éxito completo
ante rechazos y omite bajas de rollback si fallaron productos anteriores.
24 pruebas de importación/restauración aprobaron; compilación aprobada.

La siembra también separa las altas de las actualizaciones cuando se activa la
auditoría: pide motivo al sobrescribir, conserva el ID existente y usa inserción
que ignora conflictos para códigos nuevos. Si otro equipo creó un código después
de la lectura, lo conserva en lugar de sobrescribirlo sin justificación.
33 pruebas de siembra/importación/restauración aprobaron, incluidas bajas de
rollback ante rechazo y altas sin motivo transitorio.

Revisión de rutas secundarias: altas rápidas y desde Proveedores son inserciones;
envases y combos no escriben precio de venta en productos. Sincronización local
y artículos libres todavía usan upsert por ID; falta comprobar recuperación y
colisiones con la migración activa antes de activar y distribuirla.

Falta comprobar las rutas offline y la recuperación;
comprobar rechazo sin actualizar caché; actualizar el paquete y coordinar la
aplicación con el despliegue. No se considera terminada la función completa.

## Autoevaluación

Exactitud 4/5: pruebas SQL locales; falta esquema remoto. Completitud 3/5:
contrato de servidor y cuatro rutas implementados; falta revisión de escrituras secundarias y piloto remoto.
Claridad 4/5: requisito de coordinación explícito; falta guía final de instalación.
Utilidad 4/5: auditoría transaccional probada; aún no utilizable desde interfaz.
Concisión 4/5: reutiliza el trigger existente; queda documentación de transición.
Promedio 3,8/5. Prioridad: integrar las rutas de escritura antes de distribuir SQL.
