# Verificación de seguridad en PostgreSQL

## Evidencia local

`src/lib/securityMigrations.test.ts` ejecuta las migraciones reales sobre PostgreSQL en memoria con PGlite. Usa las funciones de autorización y políticas de productos, usuarios y ventas de `supabase_seguridad_roles_rls.sql`. Los perfiles, comercios y operaciones son ficticios. `auth.uid()` y `auth.role()` se emulan con variables de sesión; el cliente cambia a `SET ROLE authenticated` para comprobar RLS y permisos de tabla.

La prueba de base usa un esquema mínimo para estas operaciones; no reproduce todo el esquema de producción, la validación de JWT de Supabase ni PostgREST. Sus resultados no prueban qué migraciones o políticas están activas en una instancia remota.

Se reprodujeron fallas antes de corregirlas:

- Alta con costo rechazada por la FK inmediata del trigger `BEFORE INSERT`.
- Cambio a costo cero que conservaba el costo privado anterior.
- Cambio de actor/fecha de una venta ya anulada permitido por falta de trigger sobre esas columnas.
- Cajero que podía elevar su propio rol, y dueño que podía crear/asignar privilegios globales.
- Dos perfiles permitidos para una misma identidad de autenticación.
- Cambio de precio de catálogo por cajero y ausencia de detalle anterior/nuevo en auditoría.
- Guardado de catálogo que devolvía éxito aun cuando el servidor rechazaba permisos.

Las correcciones conservan el alta de productos con costo, las actualizaciones legítimas del dueño, la administración de empleados, la edición del nombre propio, las operaciones de superadmin y el mantenimiento SQL administrativo. La FK diferida sigue rechazando costos huérfanos. El identificador de autenticación y el rol quedan en auditoría aun si se elimina el perfil referenciado.

## Ejecutar las comprobaciones

Desde la raíz del proyecto, después de instalar dependencias:

```powershell
npm test -- --run src/lib/securityMigrations.test.ts src/hooks/useProducts.test.ts
npm test -- --run
npm run build
```

La dependencia PGlite es de desarrollo y no se incluye en la aplicación de producción. Las pruebas no necesitan credenciales ni conexiones a Supabase.

## Orden de migraciones en una base de prueba

1. `supabase_seguridad_roles_rls.sql`: funciones auxiliares y políticas base.
2. `supabase_fase_seguridad_perfiles.sql`: protege rol, identidad, acceso y privilegios globales. Si detecta identidades duplicadas, aborta; requiere resolverlas administrativamente sin borrar datos como corrección automática.
3. `supabase_fase_seguridad_costos_privados.sql`: copia costos privados y normaliza la columna pública; corrige la FK y permite costo cero.
4. `supabase_fase_auditoria_anulaciones.sql`: actor/fecha verificables, auditoría protegida e inmutabilidad de la identidad de venta y sus datos de anulación.
5. `supabase_fase_auditoria_precios.sql`: solo dueño/superadmin/backend autorizado cambia el precio de catálogo; guarda actor, fecha y valores anterior/nuevo. Usa una descripción automática de la operación; una justificación específica del operador sigue pendiente.
6. `supabase_fase_backup_integral.sql`: genera un snapshot coherente de las colecciones declaradas y sus costos; requiere roles, perfiles y costos privados. Ver `docs/verificacion-respaldo-snapshot.md`.
7. `supabase_fase_mermas_trazables.sql`: depende de costos privados.
8. `supabase_fase_capacidades_multirrubro.sql`.

Si las versiones anteriores de costos o anulaciones ya se aplicaron, volver a aplicar las versiones corregidas en la base de prueba actualiza los triggers y la FK. La prueba verifica que reaplicar costos conserva los valores privados. No ejecutar un rollback que reponga costos reales en la columna pública accesible a cajeros.

Antes de habilitar en producción, revisar las políticas efectivamente instaladas: políticas permisivas adicionales pueden ampliar accesos por su combinación con OR. Probar con cuentas reales de dueño, cajero y otro comercio mediante PostgREST; verificar que el cajero no lee costos, no se eleva de rol y no modifica precios ni anula ventas. Confirmar alta, cambio a costo cero, auditoría y administración de empleados con el esquema completo.

## Pendientes del plan

- Despliegue y validación de políticas/triggers remotos; las migraciones no se aplicaron desde esta sesión.
- Umbral y aprobación de descuentos excepcionales, justificación de cambios de precio y auditoría de apertura manual del cajón.
- Consulta de auditoría desde la interfaz.
- Cola persistente y conciliación de cambios de catálogo realizados sin red: el guardado actual conserva el cambio en caché y advierte que falta sincronizar, pero la carga remota posterior aún puede reemplazarlo. Ese flujo requiere trabajo adicional para cumplir la recuperación offline.
- Restauración completa en base de prueba, copias automáticas, retención y criterios de hardware/pagos del plan.

## Autoevaluación de esta revisión

| Criterio | Puntaje | Evidencia y mejora pendiente |
|---|---:|---|
| Exactitud | 4/5 | Restricciones ejecutadas en PostgreSQL; falta JWT/PostgREST y esquema remoto completo. |
| Completitud | 3/5 | Se cerraron fallas de costos, perfiles, precios y anulaciones; descuentos, cajón y recuperación offline siguen pendientes. |
| Claridad | 4/5 | Se documentan alcance y orden de SQL; el precio aún usa descripción automática en lugar de justificación del operador. |
| Accionabilidad | 4/5 | Pruebas reproducibles sin credenciales; queda aplicar y verificar en una base de prueba real. |
| Concisión | 4/5 | Fixture compartida evita duplicar bases; el archivo reúne varios dominios y convendrá dividirlo al ampliar cobertura. |

Promedio: **3,8/5**. Mejoras prioritarias: validar despliegue real, cerrar recuperación offline y completar autorizaciones/auditoría restantes. La fase de seguridad completa no se considera terminada con esta evidencia local.
