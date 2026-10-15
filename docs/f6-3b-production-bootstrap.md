# F6.3B — bootstrap de producción

Este runbook prepara la instalación futura en un proyecto Supabase limpio. No autoriza su ejecución. El runner remoto es independiente del importador local: `IMPORT_LOCAL` y `IMPORT_ZERO_ROW_PACKAGE_LOCAL` siguen aceptando únicamente loopback, puerto 54322 y base `postgres`.

## Prueba offline del plan

Con el paquete reconciliado en `C:\KioskoPOS-Migration\pre-cutover-export`:

```powershell
node scripts/f6-3b-production-bootstrap.mjs PLAN_PRODUCTION_BOOTSTRAP --target-ref <NEW_PRODUCTION_REF> --package 'C:\KioskoPOS-Migration\pre-cutover-export'
```

El modo plan no acepta una URL de base de datos, no abre conexiones y no ejecuta SQL. Devuelve el ref solicitado, el manifest SQL canónico con los 43 SHA-256, la separación 41/import/042/900, los hashes del paquete y el no-op de importación esperado. Rechaza los refs legacy y staging, y cualquier paquete que no sea cero filas.

## Identidad del destino

El modo remoto futuro requiere `F6_PRODUCTION_DATABASE_URL` en el entorno del proceso, nunca como argumento. Sólo admite:

- Direct: `db.<project-ref>.supabase.co:5432/postgres`, usuario `postgres`.
- Session Pooler: hostname oficial `aws-0-<region>.pooler.supabase.com:5432/postgres`, usuario `postgres.<project-ref>`.

Ambos requieren `sslmode=verify-full`, validación de certificado y coincidencia exacta entre el ref derivado y `--confirm-target-ref`. El Transaction Pooler (6543), refs `wlqujnwxrmksheubfrha` y `acoyfwwmhaeruciyedri`, localhost, hosts no oficiales, base distinta y TLS más débil se rechazan.

## Preflight de destino vacío

El runner requiere rol `postgres`, base `postgres` y conexión con escritura habilitada. Antes del primer SQL revisa `public` y ejecuta `preflight.sql`. El criterio permite únicamente objetos de `public` que sean miembros de una allowlist fija de extensiones Supabase/PostgreSQL; cualquier objeto de aplicación, extensión desconocida u objeto contractual KioskoPOS ya existente bloquea. La allowlist se mantiene en `scripts/f6-3b-production-bootstrap.mjs` y `supabase/bootstrap/preflight.sql`; se debe revisar cualquier diferencia entre la lista y el estado administrado real antes de la ejecución.

El preflight existente compara los refs esperados/observados proporcionados por el operador. El runner deriva el ref de la URL validada y además exige igualdad con el argumento confirmado; no usa el SQL package para seleccionar rutas.

## Orden y transacciones

El `bootstrap manifest` es la única fuente del orden y rutas SQL. El runner valida sus hashes y exige 43 archivos: 41 pre-import, luego la ventana de importación cero-filas, `steps/042_post_import_triggers.sql` y `900_final_security.sql`. Cada SQL se envía por separado y, según el análisis estático de los 43 archivos, cada uno abre y confirma su propia transacción. No se ejecuta `migration repair` ni se reanuda una instalación fallida.

Secuencia remota:

1. Identidad y preflight remoto.
2. 41 SQL en orden canónico.
3. Checkpoint PRE_TRIGGERS: cero triggers operativos.
4. Volver a validar el paquete aprobado; total de negocio y Auth mappings igual a cero.
5. Importación no-op, sin DML.
6. Reconciliación pre-trigger.
7. `042_post_import_triggers.sql` y verificación exacta de 15 triggers.
8. `900_final_security.sql`.
9. Postflight y reconciliación final sin cambios inesperados.

La validación y el importador no admiten paquetes con filas migrables. El `package manifest` describe únicamente archivos de datos y nunca controla nombres de SQL.

## Preparar y ejecutar

Forma exacta del comando de plan:

```powershell
node scripts/f6-3b-production-bootstrap.mjs PLAN_PRODUCTION_BOOTSTRAP --target-ref <NEW_PRODUCTION_REF> --package 'C:\KioskoPOS-Migration\pre-cutover-export'
```

El comando remoto está implementado pero no se debe usar hasta un gate separado y una aprobación explícita:

```powershell
node scripts/f6-3b-production-bootstrap.mjs PRODUCTION_BOOTSTRAP_REMOTE --enable-production-bootstrap --confirm-target-ref <NEW_PRODUCTION_REF> --package 'C:\KioskoPOS-Migration\pre-cutover-export' --evidence 'C:\KioskoPOS-Migration\production-bootstrap-evidence.json'
```

La variable `F6_PRODUCTION_DATABASE_URL` debe ser inyectada por un canal local seguro; no pegar su valor en el comando ni en logs. La ruta de evidencia debe ser nueva, estar fuera del repo y no existir previamente.

El evidence JSON registra ref, hashes, paso último aprobado, estados, conteos estructurales/de seguridad, triggers y estado de reconciliación. No registra URL, usuario/contraseña de conexión, claves, JWT ni service role. `RUNNING` con `writeAttempted=true` tras una interrupción se considera contaminado. Un fallo después de intentar un SQL termina como `TAINTED_BOOTSTRAP`: detenerse y recrear el proyecto bajo una aprobación independiente; nunca continuar desde el último paso ni reparar incrementalmente. El fallo antes de cualquier SQL queda `BLOCKED_NO_WRITES`.

## Gates todavía separados

- Este runner no crea proyectos ni configura hosted Auth. El siguiente flujo está documentado en [F6.3B-2B Initial Platform Admin](f6-3b-2b-initial-platform-admin.md) y sólo admite rehearsal loopback; no se ejecutó en hosted.
- El flujo existente `provision-user` sigue requiriendo un actor activo existente y sólo puede crear `CAJERO`/`VISOR`; no es el mecanismo de bootstrap inicial.
- Edge Functions, secretos, Vercel, ramas y deploy no se modifican aquí.
- El destino real debe verificarse en Dashboard antes de cualquier ejecución futura. Este gate no hizo conexiones remotas.
