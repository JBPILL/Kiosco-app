# Aplicar las mejoras SQL de KioskoPOS en Supabase

## 1. Preparar el proyecto

Abrí el Dashboard de Supabase y seleccioná el proyecto que usa KioskoPOS. Confirmá su identidad antes de ejecutar SQL. Primero aplicá el procedimiento en una base de prueba con el esquema completo.

Guardá un respaldo de la base antes de migrar. El JSON operativo de KioskoPOS no incluye ventas, caja ni todas las relaciones. Revisá Database > Backups y la disponibilidad de recuperación de tu proyecto; para proyectos sin copias administradas disponibles, prepará un dump externo. Los objetos de Storage necesitan su propia copia. Ver [respaldos de Supabase](https://supabase.com/docs/guides/platform/backups).

## 2. Comprobar el esquema y perfiles

En SQL Editor, creá una consulta nueva y ejecutá:

```sql
SELECT nombre, to_regclass('public.' || nombre) AS tabla
FROM unnest(ARRAY['kioscos','usuarios','productos','categorias','clientes',
  'proveedores','promociones','lotes_producto','movimientos_stock','ventas','auditoria']) AS nombre;

SELECT auth_user_id, count(*) AS perfiles
FROM public.usuarios
WHERE auth_user_id IS NOT NULL
GROUP BY auth_user_id HAVING count(*) > 1;
```

Todas las tablas deben existir. Si aparecen identidades duplicadas, resolvé cuál es el perfil legítimo antes de avanzar; la migración de perfiles aborta ante duplicados y no elimina datos. Si falta una tabla/columna, conservá el mensaje de error y revisá el esquema instalado antes de continuar. No ejecutes todos los SQL históricos del repositorio: algunos corresponden a versiones alternativas.

## 3. Ejecutar los archivos en orden

Abrí cada archivo del repositorio, copiá su contenido completo en una consulta nueva del SQL Editor y ejecutá Run. Guardá la consulta con el nombre del archivo y anotá el resultado. El SQL Editor permite ejecutar y guardar consultas, según la [documentación de Supabase](https://supabase.com/docs/guides/database/overview).

| Orden | Archivo | Propósito |
|---|---|---|
| 1 | `supabase_seguridad_roles_rls.sql` | Funciones de autorización y políticas base. |
| 2 | `supabase_fase_seguridad_perfiles.sql` | Protege roles, identidad y privilegios. |
| 3 | `supabase_fase_seguridad_costos_privados.sql` | Migra los costos reales a una tabla protegida. |
| 4 | `supabase_fase_auditoria_anulaciones.sql` | Protege motivo, actor y auditoría de anulaciones. |
| 5 | `supabase_fase_auditoria_precios.sql` | Restringe y audita cambios de precio. |
| 6 | `supabase_fase_backup_integral.sql` | Habilita el snapshot operativo con costos privados. |
| 7 | `supabase_fase_mermas_trazables.sql` | Registra costo histórico, lotes y movimientos de stock. |
| 8 | `supabase_fase_capacidades_multirrubro.sql` | Agrega capacidades configurables por comercio. |
| 9 | `supabase_fase_stock_idempotente.sql` | Evita duplicar movimientos manuales al reintentar la misma solicitud. Requiere el paso 7. |

Si una consulta falla, detené la secuencia y guardá el error completo. Los archivos con BEGIN/COMMIT se ejecutan completos; si quedó una transacción abortada, ejecutá ROLLBACK antes de reintentar. No repongas costos privados en la columna pública como rollback. La aplicación actualizada necesita estas migraciones: sin la RPC de snapshot no genera nuevos respaldos.

## 4. Verificar instalación y acceso

```sql
SELECT to_regclass('public.producto_costos') AS costos_privados,
       to_regprocedure('public.generar_snapshot_backup(uuid)') AS snapshot;

SELECT count(*) AS costos_publicos_no_cero
FROM public.productos WHERE precio_costo <> 0;

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('usuarios','productos','producto_costos','ventas','auditoria','lotes_producto','movimientos_stock')
ORDER BY tablename, policyname;

SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

NOTIFY pgrst, 'reload schema';
```

El conteo de costos públicos no cero debe ser cero después de la migración. Que aparezcan tablas y triggers confirma su instalación, pero no demuestra los permisos efectivos. Revisá políticas adicionales permisivas: pueden ampliar acceso al combinarse con OR. No elimines políticas sin identificar su propósito y dependencia.

Desde KioskoPOS, con sesiones reales separadas:

- Dueño: crear producto con costo, guardar costo cero, cambiar precio, descargar respaldo y verificar los seis conteos y costos en un comercio de prueba.
- Cajero: comprobar que no obtiene costos privados ni puede elevar rol, cambiar precios de catálogo o anular ventas.
- Otro comercio: comprobar aislamiento de productos, costos y respaldo.
- Dueño: registrar una merma y verificar stock, lote y movimiento; comprobar costo histórico y reversión coherente ante error.
- Ajustes: guardar capacidades, recargar y comprobar su persistencia.

Probá la restauración en la base de prueba; todavía aplica escrituras por etapas y no garantiza rollback global. No uses una restauración de ensayo sobre el comercio activo.

## 5. Publicar la aplicación

Después de aplicar y comprobar el SQL del entorno destino, desplegá el frontend actualizado. `git push` publica código en GitHub; no ejecuta estas migraciones en Supabase. Si el hosting despliega automáticamente desde master, coordiná la migración SQL antes de usar la nueva versión.

Estado de esta sesión: SQL preparado y comprobado parcialmente con PostgreSQL local en memoria; no aplicado a Supabase remoto. Las verificaciones de mermas, JWT/PostgREST y esquema completo siguen pendientes.

Actualización de mermas: la migración corrigió el descuento de lotes en ajustes negativos, rechaza cantidades de más de tres decimales y habilita ejecución del backend de servicio. Si ya ejecutaste el paso 7 antes de esta corrección, volvé a ejecutar ese archivo completo. Ver alcance de las pruebas y conciliación pendiente en `docs/verificacion-mermas-postgresql.md`.

El frontend con reintentos seguros necesita también el paso 9. Sin esa función, el movimiento informa un error; no recurre a una escritura sin protección contra duplicados. La función anterior permanece disponible para clientes anteriores.

El paso 9 incluye ahora `resolver_operacion_stock` para la pantalla de pendientes. Reaplicá el archivo si ejecutaste su versión inicial. Consultar una operación ausente no la cancela; cancelar reserva su identificador e impide que una solicitud demorada se ejecute luego. Cancelar una operación aplicada informa su resultado y no revierte el movimiento.
